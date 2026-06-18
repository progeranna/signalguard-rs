use std::time::Duration;

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use futures_util::{Stream, StreamExt};
use sqlx::PgPool;
use tokio::{sync::watch, time::sleep};
use tokio_tungstenite::{
    connect_async,
    tungstenite::{Error as WebSocketError, protocol::Message},
};
use tracing::{info, warn};

use crate::{
    config::{BinanceSettings, DetectorSettings, IngestionSettings},
    exchange::binance,
    storage::RedisCache,
    telemetry::InternalCounters,
};

use super::{IngestedEvent, IngestionSource, pipeline};

#[derive(Debug, Default)]
pub struct LiveRunReport {
    pub received_events: usize,
}

#[derive(Debug, Default)]
struct ConnectedStreamReport {
    received_events: usize,
    shutdown_requested: bool,
}

pub async fn run_live_ingestion(
    settings: &IngestionSettings,
    binance_settings: &BinanceSettings,
    pool: PgPool,
    redis_cache: RedisCache,
    detector_settings: DetectorSettings,
    counters: InternalCounters,
    shutdown: watch::Receiver<bool>,
) -> Result<LiveRunReport> {
    let (sender, receiver) = super::event_channel(settings.event_channel_capacity);
    let pipeline_task = tokio::spawn(pipeline::run_event_pipeline(
        receiver,
        pool,
        redis_cache,
        detector_settings,
        counters.clone(),
    ));
    let live_result = run_live_source(settings, binance_settings, sender, counters, shutdown).await;
    let pipeline_report = pipeline_task
        .await
        .context("live event pipeline task failed to join")?;

    live_result.inspect(|report| {
        info!(
            received_events = report.received_events,
            processed_events = pipeline_report.processed_events,
            "live ingestion finished"
        );
    })
}

async fn run_live_source(
    settings: &IngestionSettings,
    binance_settings: &BinanceSettings,
    sender: tokio::sync::mpsc::Sender<IngestedEvent>,
    counters: InternalCounters,
    mut shutdown: watch::Receiver<bool>,
) -> Result<LiveRunReport> {
    let url = binance::combined_stream_url(&binance_settings.websocket_base_url, &settings.symbols)
        .context("failed to build Binance combined stream URL")?;
    let min_backoff = Duration::from_millis(binance_settings.reconnect_min_backoff_ms);
    let max_backoff = Duration::from_millis(binance_settings.reconnect_max_backoff_ms);
    let mut reconnect_attempt = 0u32;
    let mut received_events = 0usize;

    loop {
        if *shutdown.borrow() {
            break;
        }

        info!(
            attempt = reconnect_attempt + 1,
            symbols = settings.symbols.len(),
            "connecting to Binance live stream"
        );

        match connect_async(&url).await {
            Ok((stream, _response)) => {
                reconnect_attempt = 0;
                let (_writer, reader) = stream.split();
                let stream_report =
                    run_connected_stream(reader, &sender, &counters, &mut shutdown).await?;
                received_events += stream_report.received_events;

                if stream_report.shutdown_requested {
                    return Ok(LiveRunReport { received_events });
                }
            }
            Err(error) => {
                warn!(%error, "failed to connect to Binance websocket");
            }
        }

        let backoff = reconnect_backoff(reconnect_attempt, min_backoff, max_backoff);
        counters.increment_binance_reconnect_attempts();
        warn!(
            attempt = reconnect_attempt + 1,
            backoff_ms = backoff.as_millis() as u64,
            "retrying Binance websocket connection"
        );
        reconnect_attempt = reconnect_attempt.saturating_add(1);

        tokio::select! {
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    break;
                }
            }
            _ = sleep(backoff) => {}
        }
    }

    Ok(LiveRunReport { received_events })
}

async fn run_connected_stream<Messages>(
    mut messages: Messages,
    sender: &tokio::sync::mpsc::Sender<IngestedEvent>,
    counters: &InternalCounters,
    shutdown: &mut watch::Receiver<bool>,
) -> Result<ConnectedStreamReport>
where
    Messages: Stream<Item = std::result::Result<Message, WebSocketError>> + Unpin,
{
    let mut received_events = 0usize;

    loop {
        tokio::select! {
            _ = shutdown.changed() => {
                if *shutdown.borrow() {
                    return Ok(ConnectedStreamReport {
                        received_events,
                        shutdown_requested: true,
                    });
                }
            }
            message = messages.next() => {
                match message {
                    Some(Ok(Message::Text(payload))) => {
                        if handle_binance_text_message(
                            &payload,
                            sender,
                            counters,
                            Utc::now(),
                        )
                        .await?
                        {
                            received_events += 1;
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Ping(_))) => {}
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Frame(_))) => {}
                    Some(Ok(Message::Close(frame))) => {
                        warn!(?frame, "Binance websocket closed");
                        break;
                    }
                    Some(Err(error)) => {
                        warn!(%error, "Binance websocket read failed");
                        break;
                    }
                    None => {
                        warn!("Binance websocket stream ended");
                        break;
                    }
                }
            }
        }
    }

    Ok(ConnectedStreamReport {
        received_events,
        shutdown_requested: false,
    })
}

async fn handle_binance_text_message(
    payload: &str,
    sender: &tokio::sync::mpsc::Sender<IngestedEvent>,
    counters: &InternalCounters,
    ingest_time: DateTime<Utc>,
) -> Result<bool> {
    match binance::parse_combined_stream_message(payload, ingest_time) {
        Ok(event) => {
            sender
                .send(IngestedEvent::new(IngestionSource::Binance, event))
                .await
                .map_err(|_| anyhow::anyhow!("live event pipeline receiver dropped"))?;
            Ok(true)
        }
        Err(error) => {
            counters.increment_binance_parse_errors();
            warn!(%error, "failed to parse Binance stream payload");
            Ok(false)
        }
    }
}

fn reconnect_backoff(attempt: u32, min_backoff: Duration, max_backoff: Duration) -> Duration {
    let multiplier = 1u128 << attempt.min(16);
    let backoff_ms = min_backoff.as_millis().saturating_mul(multiplier);

    Duration::from_millis(backoff_ms.min(max_backoff.as_millis()) as u64)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use chrono::{TimeZone, Utc};

    use crate::{ingestion::NormalizedEvent, telemetry::InternalCounters};

    use super::{handle_binance_text_message, reconnect_backoff};

    #[test]
    fn reconnect_backoff_is_bounded_and_deterministic() {
        let min = Duration::from_millis(500);
        let max = Duration::from_millis(5_000);

        assert_eq!(reconnect_backoff(0, min, max), Duration::from_millis(500));
        assert_eq!(reconnect_backoff(1, min, max), Duration::from_millis(1_000));
        assert_eq!(reconnect_backoff(2, min, max), Duration::from_millis(2_000));
        assert_eq!(reconnect_backoff(4, min, max), Duration::from_millis(5_000));
        assert_eq!(
            reconnect_backoff(12, min, max),
            Duration::from_millis(5_000)
        );
    }

    #[tokio::test]
    async fn live_text_message_forwards_depth_event_without_network() {
        let counters = InternalCounters::default();
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let forwarded = handle_binance_text_message(
            r#"{"stream":"btcusdt@depth","data":{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[["65048.00","1.20"]],"a":[["65055.00","0.80"]]}}"#,
            &sender,
            &counters,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 3).unwrap(),
        )
        .await
        .unwrap();

        assert!(forwarded);
        assert_eq!(counters.snapshot_at(Utc::now()).binance_parse_errors, 0);

        let event = receiver.recv().await.unwrap();
        assert_eq!(event.source, crate::ingestion::IngestionSource::Binance);
        assert!(matches!(event.event, NormalizedEvent::Depth(_)));
    }

    #[tokio::test]
    async fn malformed_live_depth_payload_increments_binance_parse_error_counter() {
        let counters = InternalCounters::default();
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let forwarded = handle_binance_text_message(
            r#"{"stream":"btcusdt@depth","data":{"e":"depthUpdate""#,
            &sender,
            &counters,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 3).unwrap(),
        )
        .await
        .unwrap();

        assert!(!forwarded);
        assert!(receiver.try_recv().is_err());
        assert_eq!(counters.snapshot_at(Utc::now()).parse_errors, 1);
        assert_eq!(counters.snapshot_at(Utc::now()).binance_parse_errors, 1);
    }
}

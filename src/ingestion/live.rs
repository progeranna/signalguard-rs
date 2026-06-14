use std::time::Duration;

use anyhow::{Context, Result};
use futures_util::StreamExt;
use sqlx::PgPool;
use tokio::{sync::watch, time::sleep};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{info, warn};

use crate::{
    config::{BinanceSettings, DetectorSettings, IngestionSettings},
    exchange::binance,
    storage::RedisCache,
    telemetry::InternalCounters,
};

use super::{NormalizedEvent, pipeline};

#[derive(Debug, Default)]
pub struct LiveRunReport {
    pub received_events: usize,
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
    let (sender, receiver) = tokio::sync::mpsc::channel(super::EVENT_CHANNEL_CAPACITY);
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
    sender: tokio::sync::mpsc::Sender<NormalizedEvent>,
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
                let (_writer, mut reader) = stream.split();

                loop {
                    tokio::select! {
                        _ = shutdown.changed() => {
                            if *shutdown.borrow() {
                                return Ok(LiveRunReport { received_events });
                            }
                        }
                        message = reader.next() => {
                            match message {
                                Some(Ok(Message::Text(payload))) => {
                                    match binance::parse_combined_stream_message(&payload, chrono::Utc::now()) {
                                        Ok(event) => {
                                            if sender.send(event).await.is_err() {
                                                anyhow::bail!("live event pipeline receiver dropped");
                                            }
                                            received_events += 1;
                                        }
                                        Err(error) => {
                                            counters.increment_parse_errors();
                                            warn!(%error, "failed to parse Binance stream payload");
                                        }
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
            }
            Err(error) => {
                warn!(%error, "failed to connect to Binance websocket");
            }
        }

        let backoff = reconnect_backoff(reconnect_attempt, min_backoff, max_backoff);
        counters.increment_reconnect_attempts();
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

fn reconnect_backoff(attempt: u32, min_backoff: Duration, max_backoff: Duration) -> Duration {
    let multiplier = 1u128 << attempt.min(16);
    let backoff_ms = min_backoff.as_millis().saturating_mul(multiplier);

    Duration::from_millis(backoff_ms.min(max_backoff.as_millis()) as u64)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::reconnect_backoff;

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
}

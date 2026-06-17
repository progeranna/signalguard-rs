mod error;
mod event;
mod live;
mod pipeline;
mod replay;

use anyhow::{Context, Result};
use sqlx::PgPool;
use tokio::sync::{mpsc, watch};

use crate::{
    config::{BinanceSettings, DetectorSettings, IngestionSettings},
    storage::RedisCache,
    telemetry::InternalCounters,
};

pub use event::{IngestedEvent, IngestionSource, NormalizedEvent};
pub use live::LiveRunReport;
pub use replay::{ReplayOptions, ReplayRunReport};

pub async fn run_replay_ingestion(
    settings: &IngestionSettings,
    pool: PgPool,
    redis_cache: RedisCache,
    detector_settings: DetectorSettings,
    counters: InternalCounters,
) -> Result<ReplayRunReport> {
    let (sender, receiver) = event_channel(settings.event_channel_capacity);
    let pipeline_task = tokio::spawn(pipeline::run_event_pipeline(
        receiver,
        pool,
        redis_cache,
        detector_settings,
        counters.clone(),
    ));
    let replay_options = ReplayOptions::from_delay_ms(settings.replay_delay_ms);
    let replay_result =
        replay::run_replay_source(&settings.replay_path, sender, replay_options, counters).await;
    let pipeline_report = pipeline_task
        .await
        .context("replay event pipeline task failed to join")?;

    replay_result
        .with_context(|| {
            format!(
                "replay ingestion failed for fixture {}",
                settings.replay_path.display()
            )
        })
        .inspect(|report| {
            tracing::info!(
                emitted_events = report.emitted_events,
                processed_events = pipeline_report.processed_events,
                "replay ingestion completed"
            );
        })
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
    live::run_live_ingestion(
        settings,
        binance_settings,
        pool,
        redis_cache,
        detector_settings,
        counters,
        shutdown,
    )
    .await
    .context("live ingestion failed")
}

fn event_channel(capacity: usize) -> (mpsc::Sender<IngestedEvent>, mpsc::Receiver<IngestedEvent>) {
    mpsc::channel(capacity)
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use futures_util::poll;
    use rust_decimal::Decimal;

    use super::{IngestedEvent, IngestionSource, NormalizedEvent, event_channel};
    use crate::domain::{Exchange, Symbol, TradeEvent};

    #[tokio::test]
    async fn event_channel_applies_backpressure_at_configured_capacity() {
        let (sender, mut receiver) = event_channel(1);

        sender.send(test_event(1)).await.unwrap();

        let second_sender = sender.clone();
        let mut second_send =
            std::pin::pin!(async move { second_sender.send(test_event(2)).await });

        assert!(poll!(&mut second_send).is_pending());

        let first = receiver.recv().await.unwrap();
        assert_eq!(trade_id(&first), Some(1));

        assert!(matches!(
            poll!(&mut second_send),
            std::task::Poll::Ready(Ok(()))
        ));

        let second = receiver.recv().await.unwrap();
        assert_eq!(trade_id(&second), Some(2));
    }

    fn test_event(trade_id: u64) -> IngestedEvent {
        IngestedEvent::new(
            IngestionSource::Replay,
            NormalizedEvent::Trade(
                TradeEvent::new(
                    Symbol::new("BTCUSDT").unwrap(),
                    Exchange::Binance,
                    Some(trade_id),
                    Decimal::new(6500010, 2),
                    Decimal::new(125, 3),
                    test_now(),
                    test_now(),
                )
                .unwrap(),
            ),
        )
    }

    fn trade_id(event: &IngestedEvent) -> Option<u64> {
        match &event.event {
            NormalizedEvent::Trade(trade) => trade.trade_id,
            NormalizedEvent::Quote(_) => None,
            NormalizedEvent::Depth(_) => None,
        }
    }

    fn test_now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }
}

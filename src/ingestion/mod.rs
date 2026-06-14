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

pub use event::NormalizedEvent;
pub use live::LiveRunReport;
pub use replay::{ReplayOptions, ReplayRunReport};

const EVENT_CHANNEL_CAPACITY: usize = 128;

pub async fn run_replay_ingestion(
    settings: &IngestionSettings,
    pool: PgPool,
    redis_cache: RedisCache,
    detector_settings: DetectorSettings,
    counters: InternalCounters,
) -> Result<ReplayRunReport> {
    let (sender, receiver) = mpsc::channel(EVENT_CHANNEL_CAPACITY);
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

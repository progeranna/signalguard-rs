use chrono::Utc;
use sqlx::PgPool;
use tokio::sync::mpsc;
use tracing::warn;

use crate::{
    config::DetectorSettings,
    detectors::DetectorEngine,
    state::MarketStateAggregator,
    storage::{RedisCache, insert_anomaly, insert_quote, insert_trade},
    telemetry::InternalCounters,
};

use super::NormalizedEvent;

#[derive(Debug, Default)]
pub struct PipelineReport {
    pub processed_events: usize,
}

pub async fn run_event_pipeline(
    mut receiver: mpsc::Receiver<NormalizedEvent>,
    pool: PgPool,
    redis_cache: RedisCache,
    detector_settings: DetectorSettings,
    counters: InternalCounters,
) -> PipelineReport {
    let mut processed_events = 0usize;
    let mut aggregator = MarketStateAggregator::default();
    let mut detector_engine = DetectorEngine::default();

    while let Some(event) = receiver.recv().await {
        processed_events += 1;
        counters.record_message_at(Utc::now());

        // Current state and cache may advance even if historical PostgreSQL persistence fails.
        let symbol = aggregator.apply(&event);
        let Some(latest_state) = aggregator.snapshot(&symbol) else {
            warn!(symbol = %symbol, "failed to produce latest market state snapshot");
            continue;
        };

        match &event {
            NormalizedEvent::Trade(trade) => {
                if let Err(error) = insert_trade(&pool, trade).await {
                    counters.increment_storage_errors();
                    warn!(
                        symbol = %trade.symbol,
                        event_time = %trade.event_time,
                        %error,
                        "failed to persist trade event"
                    );
                }
            }
            NormalizedEvent::Quote(quote) => {
                if let Err(error) = insert_quote(&pool, quote).await {
                    counters.increment_storage_errors();
                    warn!(
                        symbol = %quote.symbol,
                        event_time = %quote.event_time,
                        %error,
                        "failed to persist quote event"
                    );
                }
            }
        }

        if let Err(error) = redis_cache.set_market_state(&latest_state).await {
            counters.increment_cache_errors();
            warn!(
                symbol = %symbol,
                %error,
                "failed to cache latest market state"
            );
        }

        let anomalies = detector_engine.evaluate(&latest_state, &detector_settings, Utc::now());
        for anomaly in anomalies {
            if let Err(error) = insert_anomaly(&pool, &anomaly).await {
                counters.increment_storage_errors();
                warn!(
                    symbol = %anomaly.symbol,
                    anomaly_type = %anomaly.anomaly_type.as_str(),
                    event_time = %anomaly.event_time,
                    %error,
                    "failed to persist anomaly event"
                );
            }
        }
    }

    PipelineReport { processed_events }
}

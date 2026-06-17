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

use super::{IngestedEvent, IngestionSource, NormalizedEvent};

#[derive(Debug, Default)]
pub struct PipelineReport {
    pub processed_events: usize,
}

pub async fn run_event_pipeline(
    mut receiver: mpsc::Receiver<IngestedEvent>,
    pool: PgPool,
    redis_cache: RedisCache,
    detector_settings: DetectorSettings,
    counters: InternalCounters,
) -> PipelineReport {
    let mut processed_events = 0usize;
    let mut aggregator = MarketStateAggregator::default();
    let mut detector_engine = DetectorEngine::default();

    while let Some(ingested_event) = receiver.recv().await {
        processed_events += 1;
        record_ingested_event_metrics(&counters, &ingested_event);

        // Current state and cache may advance even if historical PostgreSQL persistence fails.
        let symbol = aggregator.apply(&ingested_event.event);
        let Some(latest_state) = aggregator.snapshot(&symbol) else {
            warn!(symbol = %symbol, "failed to produce latest market state snapshot");
            continue;
        };

        persist_normalized_event(&pool, &counters, &ingested_event.event).await;
        update_latest_state_cache(&redis_cache, &counters, &symbol, &latest_state).await;
        detect_and_persist_anomalies(
            &pool,
            &mut detector_engine,
            &detector_settings,
            &counters,
            &latest_state,
        )
        .await;
    }

    PipelineReport { processed_events }
}

fn record_ingested_event_metrics(counters: &InternalCounters, ingested_event: &IngestedEvent) {
    counters.record_message_at(Utc::now());
    increment_processed_event_counter(counters, ingested_event.source, &ingested_event.event);
}

async fn persist_normalized_event(
    pool: &PgPool,
    counters: &InternalCounters,
    event: &NormalizedEvent,
) {
    match event {
        NormalizedEvent::Trade(trade) => {
            if let Err(error) = insert_trade(pool, trade).await {
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
            if let Err(error) = insert_quote(pool, quote).await {
                counters.increment_storage_errors();
                warn!(
                    symbol = %quote.symbol,
                    event_time = %quote.event_time,
                    %error,
                    "failed to persist quote event"
                );
            }
        }
        NormalizedEvent::Depth(_) => {}
    }
}

async fn update_latest_state_cache(
    redis_cache: &RedisCache,
    counters: &InternalCounters,
    symbol: &crate::domain::Symbol,
    latest_state: &crate::domain::MarketState,
) {
    if let Err(error) = redis_cache.set_market_state(latest_state).await {
        counters.increment_cache_errors();
        warn!(symbol = %symbol, %error, "failed to cache latest market state");
    }
}

async fn detect_and_persist_anomalies(
    pool: &PgPool,
    detector_engine: &mut DetectorEngine,
    detector_settings: &DetectorSettings,
    counters: &InternalCounters,
    latest_state: &crate::domain::MarketState,
) {
    let anomalies = detector_engine.evaluate(latest_state, detector_settings, Utc::now());

    for anomaly in anomalies {
        if let Err(error) = insert_anomaly(pool, &anomaly).await {
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

fn increment_processed_event_counter(
    counters: &InternalCounters,
    source: IngestionSource,
    event: &NormalizedEvent,
) {
    match (source, event) {
        (IngestionSource::Replay, NormalizedEvent::Trade(_)) => {
            counters.increment_replay_trade_events();
        }
        (IngestionSource::Replay, NormalizedEvent::Quote(_)) => {
            counters.increment_replay_quote_events();
        }
        (IngestionSource::Binance, NormalizedEvent::Trade(_)) => {
            counters.increment_binance_trade_events();
        }
        (IngestionSource::Binance, NormalizedEvent::Quote(_)) => {
            counters.increment_binance_quote_events();
        }
        (IngestionSource::Replay, NormalizedEvent::Depth(_)) => {
            counters.increment_replay_depth_events();
        }
        (IngestionSource::Binance, NormalizedEvent::Depth(_)) => {
            counters.increment_binance_depth_events();
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
    use tokio::sync::mpsc;

    use super::{increment_processed_event_counter, run_event_pipeline};
    use crate::{
        config::DetectorSettings,
        domain::{
            DepthLevel, DepthUpdate, Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent,
        },
        ingestion::{IngestedEvent, IngestionSource, NormalizedEvent},
        storage::RedisCache,
        telemetry::InternalCounters,
    };

    #[test]
    fn replay_trade_event_increments_replay_trade_counter() {
        let counters = InternalCounters::default();

        increment_processed_event_counter(
            &counters,
            IngestionSource::Replay,
            &NormalizedEvent::Trade(test_trade_event()),
        );

        let snapshot = counters.snapshot_at(test_now());

        assert_eq!(snapshot.replay_trade_events, 1);
        assert_eq!(snapshot.replay_quote_events, 0);
        assert_eq!(snapshot.binance_trade_events, 0);
        assert_eq!(snapshot.binance_quote_events, 0);
    }

    #[test]
    fn replay_quote_event_increments_replay_quote_counter() {
        let counters = InternalCounters::default();

        increment_processed_event_counter(
            &counters,
            IngestionSource::Replay,
            &NormalizedEvent::Quote(test_quote_event()),
        );

        let snapshot = counters.snapshot_at(test_now());

        assert_eq!(snapshot.replay_trade_events, 0);
        assert_eq!(snapshot.replay_quote_events, 1);
        assert_eq!(snapshot.binance_trade_events, 0);
        assert_eq!(snapshot.binance_quote_events, 0);
    }

    #[test]
    fn binance_trade_event_increments_binance_trade_counter() {
        let counters = InternalCounters::default();

        increment_processed_event_counter(
            &counters,
            IngestionSource::Binance,
            &NormalizedEvent::Trade(test_trade_event()),
        );

        let snapshot = counters.snapshot_at(test_now());

        assert_eq!(snapshot.replay_trade_events, 0);
        assert_eq!(snapshot.replay_quote_events, 0);
        assert_eq!(snapshot.binance_trade_events, 1);
        assert_eq!(snapshot.binance_quote_events, 0);
    }

    #[test]
    fn binance_quote_event_increments_binance_quote_counter() {
        let counters = InternalCounters::default();

        increment_processed_event_counter(
            &counters,
            IngestionSource::Binance,
            &NormalizedEvent::Quote(test_quote_event()),
        );

        let snapshot = counters.snapshot_at(test_now());

        assert_eq!(snapshot.replay_trade_events, 0);
        assert_eq!(snapshot.replay_quote_events, 0);
        assert_eq!(snapshot.binance_trade_events, 0);
        assert_eq!(snapshot.binance_quote_events, 1);
    }

    #[test]
    fn depth_event_increments_source_event_counters() {
        let counters = InternalCounters::default();

        increment_processed_event_counter(
            &counters,
            IngestionSource::Replay,
            &NormalizedEvent::Depth(test_depth_update()),
        );
        increment_processed_event_counter(
            &counters,
            IngestionSource::Binance,
            &NormalizedEvent::Depth(test_depth_update()),
        );

        let snapshot = counters.snapshot_at(test_now());

        assert_eq!(snapshot.replay_trade_events, 0);
        assert_eq!(snapshot.replay_quote_events, 0);
        assert_eq!(snapshot.replay_depth_events, 1);
        assert_eq!(snapshot.binance_trade_events, 0);
        assert_eq!(snapshot.binance_quote_events, 0);
        assert_eq!(snapshot.binance_depth_events, 1);
    }

    #[tokio::test]
    async fn depth_event_updates_latest_state_cache_without_postgres_persistence() {
        let (sender, receiver) = mpsc::channel(1);
        let cache = RedisCache::in_memory(Vec::new());
        let counters = InternalCounters::default();
        let depth = test_depth_update();
        let symbol = depth.symbol.clone();

        sender
            .send(IngestedEvent::new(
                IngestionSource::Replay,
                NormalizedEvent::Depth(depth),
            ))
            .await
            .unwrap();
        drop(sender);

        let report = run_event_pipeline(
            receiver,
            unused_test_pool(),
            cache.clone(),
            detector_settings(),
            counters.clone(),
        )
        .await;
        let cached_state = cache.get_market_state(&symbol).await.unwrap().unwrap();
        let counter_snapshot = counters.snapshot_at(test_now());

        assert_eq!(report.processed_events, 1);
        assert_eq!(cached_state.top_bid_quantity, Some(Decimal::new(125, 3)));
        assert_eq!(
            cached_state.top_bid_liquidity,
            Some(Decimal::new(812501250, 5))
        );
        assert_eq!(cached_state.last_depth_event_time, Some(test_now()));
        assert_eq!(counter_snapshot.replay_depth_events, 1);
        assert_eq!(counter_snapshot.storage_errors, 0);
    }

    #[tokio::test]
    async fn depth_event_can_trigger_detector_evaluation_after_state_update() {
        let (sender, receiver) = mpsc::channel(2);
        let cache = RedisCache::in_memory(Vec::new());
        let counters = InternalCounters::default();
        let first = test_depth_update_with_ids(Some(100), Some(101));
        let second = test_depth_update_with_ids(Some(103), Some(104));

        sender
            .send(IngestedEvent::new(
                IngestionSource::Replay,
                NormalizedEvent::Depth(first),
            ))
            .await
            .unwrap();
        sender
            .send(IngestedEvent::new(
                IngestionSource::Replay,
                NormalizedEvent::Depth(second),
            ))
            .await
            .unwrap();
        drop(sender);

        let report = run_event_pipeline(
            receiver,
            unused_test_pool(),
            cache,
            detector_settings(),
            counters.clone(),
        )
        .await;
        let counter_snapshot = counters.snapshot_at(test_now());

        assert_eq!(report.processed_events, 2);
        assert_eq!(counter_snapshot.replay_depth_events, 2);
        assert_eq!(counter_snapshot.storage_errors, 1);
    }

    fn test_trade_event() -> TradeEvent {
        TradeEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(1),
            Decimal::new(6500010, 2),
            Decimal::new(125, 3),
            test_now(),
            test_now(),
        )
        .unwrap()
    }

    fn test_quote_event() -> QuoteEvent {
        QuoteEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            TopOfBookQuote::new(
                Decimal::new(6499910, 2),
                Decimal::new(2000, 3),
                Decimal::new(6500010, 2),
                Decimal::new(1500, 3),
            )
            .unwrap(),
            test_now(),
            test_now(),
        )
        .unwrap()
    }

    fn test_depth_update() -> DepthUpdate {
        test_depth_update_with_ids(Some(100), Some(101))
    }

    fn test_depth_update_with_ids(
        first_update_id: Option<u64>,
        final_update_id: Option<u64>,
    ) -> DepthUpdate {
        DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            first_update_id,
            final_update_id,
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![],
            test_now(),
            test_now(),
        )
        .unwrap()
    }

    fn test_now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }

    fn detector_settings() -> DetectorSettings {
        DetectorSettings {
            price_move_1m_pct_threshold: Decimal::new(25, 1),
            spread_spike_pct_threshold: Decimal::new(5, 1),
            stale_data_ms_threshold: u64::MAX,
            trade_burst_multiplier: Decimal::new(3, 0),
            trade_burst_min_warmup_windows: 5,
            quote_stuck_ms_threshold: u64::MAX,
            event_lag_spike_ms_threshold: u64::MAX,
            depth_sequence_gap_min_increment: 1,
        }
    }

    fn unused_test_pool() -> sqlx::PgPool {
        PgPoolOptions::new().max_connections(1).connect_lazy_with(
            PgConnectOptions::new()
                .host("/tmp/signalguard-rs-test-unused-postgres")
                .username("signalguard")
                .password("signalguard")
                .database("signalguard"),
        )
    }
}

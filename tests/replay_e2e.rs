use std::{path::PathBuf, sync::OnceLock};

use anyhow::{Context, Result, ensure};
use chrono::Utc;
use rust_decimal::Decimal;
use signalguard_rs::{
    config::{DetectorSettings, IngestionMode, IngestionSettings},
    domain::{AnomalyType, Symbol},
    ingestion::run_replay_ingestion,
    storage::{RedisCache, get_recent_anomalies, postgres},
    telemetry::{InternalCounters, render_prometheus_metrics},
};
use sqlx::PgPool;
use tokio::sync::Mutex;

// Manual replay E2E coverage stays opt-in because it requires local PostgreSQL,
// local Redis, exported DATABASE_URL/REDIS_URL, and applied SQLx migrations.

fn replay_e2e_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[tokio::test]
#[ignore = "requires local PostgreSQL + Redis via docker compose, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn replay_fixture_populates_postgres_redis_and_counters() {
    let _guard = replay_e2e_lock().lock().await;
    let pool = test_pool().await;
    let cache = test_cache().await;

    postgres::reset_replay_storage(&pool).await.unwrap();
    cache.clear_market_state_cache().await.unwrap();

    let result = run_replay_assertions(&pool, &cache).await;

    postgres::reset_replay_storage(&pool).await.unwrap();
    cache.clear_market_state_cache().await.unwrap();

    result.unwrap();
}

#[tokio::test]
#[ignore = "requires local PostgreSQL + Redis via docker compose, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn depth_replay_fixture_populates_latest_depth_state_and_counters() {
    let _guard = replay_e2e_lock().lock().await;
    let pool = test_pool().await;
    let cache = test_cache().await;

    postgres::reset_replay_storage(&pool).await.unwrap();
    cache.clear_market_state_cache().await.unwrap();

    let result = run_depth_gap_replay_assertions(&pool, &cache).await;

    postgres::reset_replay_storage(&pool).await.unwrap();
    cache.clear_market_state_cache().await.unwrap();

    result.unwrap();
}

async fn run_replay_assertions(pool: &PgPool, cache: &RedisCache) -> Result<()> {
    let counters = InternalCounters::default();
    let report = run_replay_ingestion(
        &replay_settings("examples/replay/sample.jsonl", &["BTCUSDT", "ETHUSDT"]),
        pool.clone(),
        cache.clone(),
        detector_settings(),
        counters.clone(),
    )
    .await
    .context("replay ingestion should complete for examples/replay/sample.jsonl")?;

    ensure!(
        report.emitted_events == 8,
        "expected replay fixture to emit 8 normalized events, got {}",
        report.emitted_events
    );

    let btc = Symbol::new("BTCUSDT").unwrap();
    let eth = Symbol::new("ETHUSDT").unwrap();

    ensure!(
        count_trades_for_symbol(pool, &btc).await? == 2,
        "expected 2 BTCUSDT trades in PostgreSQL after replay"
    );
    ensure!(
        count_quotes_for_symbol(pool, &btc).await? == 2,
        "expected 2 BTCUSDT quotes in PostgreSQL after replay"
    );
    ensure!(
        count_trades_for_symbol(pool, &eth).await? == 2,
        "expected 2 ETHUSDT trades in PostgreSQL after replay"
    );
    ensure!(
        count_quotes_for_symbol(pool, &eth).await? == 2,
        "expected 2 ETHUSDT quotes in PostgreSQL after replay"
    );

    let symbols = cache.list_symbols().await?;
    ensure!(
        symbols == vec![btc.clone(), eth.clone()],
        "expected Redis symbols to be exactly [BTCUSDT, ETHUSDT], got {:?}",
        symbols
    );

    let btc_state = cache
        .get_market_state(&btc)
        .await?
        .context("expected BTCUSDT latest market state in Redis after replay")?;

    ensure!(
        btc_state.last_trade_price.is_some(),
        "expected BTCUSDT last_trade_price to be present"
    );
    ensure!(
        btc_state.best_bid_price.is_some(),
        "expected BTCUSDT best_bid_price to be present"
    );
    ensure!(
        btc_state.best_ask_price.is_some(),
        "expected BTCUSDT best_ask_price to be present"
    );
    ensure!(
        btc_state.signals.spread_pct.is_some(),
        "expected BTCUSDT spread_pct to be present"
    );
    ensure!(
        btc_state.signals.price_change_1m_pct.is_some(),
        "expected BTCUSDT price_change_1m_pct to be present"
    );
    ensure!(
        btc_state.signals.trades_per_minute.is_some(),
        "expected BTCUSDT trades_per_minute to be present"
    );

    let btc_anomalies = get_recent_anomalies(pool, Some(&btc), 50).await?;
    ensure!(
        btc_anomalies
            .iter()
            .any(|anomaly| anomaly.anomaly_type == AnomalyType::StaleData),
        "expected at least one BTCUSDT stale_data anomaly during replay"
    );

    let snapshot = counters.snapshot_at(Utc::now());
    ensure!(
        snapshot.replay_trade_events == 4,
        "expected 4 replay trade events in counters, got {}",
        snapshot.replay_trade_events
    );
    ensure!(
        snapshot.replay_quote_events == 4,
        "expected 4 replay quote events in counters, got {}",
        snapshot.replay_quote_events
    );
    ensure!(
        snapshot.binance_trade_events == 0 && snapshot.binance_quote_events == 0,
        "expected replay path not to increment Binance processed-event counters"
    );
    ensure!(
        snapshot.last_message_unix_ms.is_some(),
        "expected replay path to record a last processed message timestamp"
    );

    Ok(())
}

async fn run_depth_gap_replay_assertions(pool: &PgPool, cache: &RedisCache) -> Result<()> {
    let counters = InternalCounters::default();
    let report = run_replay_ingestion(
        &replay_settings("examples/replay/depth_gap_sample.jsonl", &["BTCUSDT"]),
        pool.clone(),
        cache.clone(),
        detector_settings(),
        counters.clone(),
    )
    .await
    .context("replay ingestion should complete for examples/replay/depth_gap_sample.jsonl")?;

    ensure!(
        report.emitted_events == 2,
        "expected depth gap replay fixture to emit 2 normalized events, got {}",
        report.emitted_events
    );

    let btc = Symbol::new("BTCUSDT").unwrap();
    ensure!(
        count_trades_for_symbol(pool, &btc).await? == 0,
        "expected 0 BTCUSDT trades in PostgreSQL after depth-only replay"
    );
    ensure!(
        count_quotes_for_symbol(pool, &btc).await? == 0,
        "expected 0 BTCUSDT quotes in PostgreSQL after depth-only replay"
    );

    let symbols = cache.list_symbols().await?;
    ensure!(
        symbols == vec![btc.clone()],
        "expected Redis symbols to be exactly [BTCUSDT] after depth replay, got {:?}",
        symbols
    );

    let btc_state = cache
        .get_market_state(&btc)
        .await?
        .context("expected BTCUSDT latest market state in Redis after depth replay")?;

    ensure!(
        btc_state.top_bid_quantity.is_some(),
        "expected BTCUSDT top_bid_quantity to be present after depth replay"
    );
    ensure!(
        btc_state.top_ask_quantity.is_some(),
        "expected BTCUSDT top_ask_quantity to be present after depth replay"
    );
    ensure!(
        btc_state.top_bid_liquidity.is_some(),
        "expected BTCUSDT top_bid_liquidity to be present after depth replay"
    );
    ensure!(
        btc_state.top_ask_liquidity.is_some(),
        "expected BTCUSDT top_ask_liquidity to be present after depth replay"
    );
    ensure!(
        btc_state.book_imbalance.is_some(),
        "expected BTCUSDT book_imbalance to be present after depth replay"
    );
    ensure!(
        btc_state.last_depth_event_time.is_some(),
        "expected BTCUSDT last_depth_event_time to be present after depth replay"
    );
    ensure!(
        btc_state.last_depth_ingest_time.is_some(),
        "expected BTCUSDT last_depth_ingest_time to be present after depth replay"
    );
    ensure!(
        btc_state.depth_sequence_gap_count == 1,
        "expected BTCUSDT depth_sequence_gap_count to be 1 after gap replay, got {}",
        btc_state.depth_sequence_gap_count
    );

    let anomalies = get_recent_anomalies(pool, Some(&btc), 50).await?;
    ensure!(
        anomalies
            .iter()
            .any(|anomaly| anomaly.anomaly_type == AnomalyType::DepthSequenceGap),
        "expected at least one BTCUSDT depth_sequence_gap anomaly during depth replay"
    );

    let snapshot = counters.snapshot_at(Utc::now());
    ensure!(
        snapshot.replay_depth_events == 2,
        "expected 2 replay depth events in counters, got {}",
        snapshot.replay_depth_events
    );
    ensure!(
        snapshot.replay_trade_events == 0 && snapshot.replay_quote_events == 0,
        "expected depth-only replay not to increment replay trade/quote counters"
    );
    ensure!(
        snapshot.binance_depth_events == 0,
        "expected depth replay not to increment Binance depth counters"
    );
    ensure!(
        snapshot.last_message_unix_ms.is_some(),
        "expected depth replay to record a last processed message timestamp"
    );

    let metrics = render_prometheus_metrics(&snapshot);
    ensure!(
        metrics.contains(
            "signalguard_events_processed_total{source=\"replay\",event_type=\"depth\"} 2"
        ),
        "expected Prometheus metrics to report 2 replay depth events, got:\n{metrics}"
    );

    Ok(())
}

fn replay_settings(path: &str, symbols: &[&str]) -> IngestionSettings {
    IngestionSettings {
        mode: IngestionMode::Replay,
        symbols: symbols
            .iter()
            .map(|symbol| Symbol::new(*symbol).unwrap())
            .collect(),
        replay_path: PathBuf::from(path),
        replay_delay_ms: 0,
        replay_reset_state: true,
        replay_reset_storage: true,
        event_channel_capacity: 1_024,
    }
}

fn detector_settings() -> DetectorSettings {
    DetectorSettings {
        price_move_1m_pct_threshold: Decimal::new(25, 1),
        spread_spike_pct_threshold: Decimal::new(5, 1),
        stale_data_ms_threshold: 5_000,
        trade_burst_multiplier: Decimal::new(3, 0),
        trade_burst_min_warmup_windows: 5,
        quote_stuck_ms_threshold: 10_000,
        event_lag_spike_ms_threshold: 3_000,
        depth_sequence_gap_min_increment: 1,
    }
}

fn replay_e2e_setup_hint() -> &'static str {
    "run `docker compose up -d postgres redis`, `export DATABASE_URL=\"postgres://signalguard:signalguard@localhost:5432/signalguard\"`, `export REDIS_URL=\"redis://127.0.0.1:6379\"`, `sqlx migrate run`, then `cargo test --test replay_e2e -- --ignored`"
}

async fn test_pool() -> PgPool {
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        panic!(
            "DATABASE_URL is required for replay E2E tests; {}",
            replay_e2e_setup_hint()
        )
    });
    let pool = postgres::connect_pool(&database_url)
        .await
        .unwrap_or_else(|error| {
            panic!("failed to connect to PostgreSQL replay E2E database: {error}")
        });

    ensure_required_tables(&pool).await;

    pool
}

async fn test_cache() -> RedisCache {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| {
        panic!(
            "REDIS_URL is required for replay E2E tests; {}",
            replay_e2e_setup_hint()
        )
    });

    RedisCache::connect(&redis_url)
        .await
        .unwrap_or_else(|error| panic!("failed to connect to Redis replay E2E cache: {error}"))
}

async fn ensure_required_tables(pool: &PgPool) {
    for table_name in ["trades", "quotes", "anomalies"] {
        let exists = sqlx::query_scalar::<_, String>(
            r#"
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
            "#,
        )
        .bind(table_name)
        .fetch_optional(pool)
        .await
        .unwrap_or_else(|error| {
            panic!("failed to verify PostgreSQL schema for replay E2E tests: {error}")
        });

        assert!(
            exists.is_some(),
            "required table `{table_name}` is missing; {}",
            replay_e2e_setup_hint()
        );
    }
}

async fn count_trades_for_symbol(pool: &PgPool, symbol: &Symbol) -> Result<i64> {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM trades
        WHERE symbol = $1
        "#,
    )
    .bind(symbol.as_str())
    .fetch_one(pool)
    .await
    .context("failed to count replay trades")
}

async fn count_quotes_for_symbol(pool: &PgPool, symbol: &Symbol) -> Result<i64> {
    sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM quotes
        WHERE symbol = $1
        "#,
    )
    .bind(symbol.as_str())
    .fetch_one(pool)
    .await
    .context("failed to count replay quotes")
}

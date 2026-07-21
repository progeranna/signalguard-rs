use std::{
    path::PathBuf,
    sync::{Arc, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use chrono::{TimeZone, Utc};
use redis::AsyncCommands;
use rust_decimal::Decimal;
use signalguard_rs::{
    api::{self, AppState},
    config::{
        BinanceSettings, DetectorSettings, HealthScoreSettings, HealthStatusThresholds,
        IngestionMode, IngestionSettings, SeverityPenaltySettings,
    },
    domain::{Exchange, MarketState, Symbol, TradeEvent},
    runtime_supervisor::IngestionSupervisor,
    storage::{RedisCache, insert_trade, postgres},
    telemetry::InternalCounters,
};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::Mutex;
use tower::ServiceExt;

fn runtime_control_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[tokio::test]
#[ignore = "requires controlled PostgreSQL + Redis, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn omitted_flags_preserve_redis_and_postgres() {
    let _guard = runtime_control_lock().lock().await;
    let environment = TestEnvironment::new(true).await;
    environment.seed().await;

    let response = environment
        .post(serde_json::json!({ "mode": "replay" }))
        .await;

    assert_eq!(response, StatusCode::OK);
    environment.assert_redis_present().await;
    environment.assert_postgres_present().await;
    environment.cleanup().await;
}

#[tokio::test]
#[ignore = "requires controlled PostgreSQL + Redis, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn explicit_redis_reset_preserves_postgres_and_unrelated_redis_key() {
    let _guard = runtime_control_lock().lock().await;
    let environment = TestEnvironment::new(true).await;
    environment.seed().await;
    environment.seed_unrelated_redis_key().await;

    let response = environment
        .post(serde_json::json!({
            "mode": "replay",
            "reset_state": true
        }))
        .await;

    assert_eq!(response, StatusCode::OK);
    environment.assert_redis_absent().await;
    environment.assert_postgres_present().await;
    environment.assert_unrelated_redis_key_present().await;
    environment.cleanup().await;
}

#[tokio::test]
#[ignore = "requires controlled PostgreSQL + Redis, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn explicit_postgres_reset_preserves_redis() {
    let _guard = runtime_control_lock().lock().await;
    let environment = TestEnvironment::new(true).await;
    environment.seed().await;

    let response = environment
        .post(serde_json::json!({
            "mode": "replay",
            "reset_storage": true
        }))
        .await;

    assert_eq!(response, StatusCode::OK);
    environment.assert_redis_present().await;
    environment.assert_postgres_absent().await;
    environment.cleanup().await;
}

#[tokio::test]
#[ignore = "requires controlled PostgreSQL + Redis, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn explicit_both_resets_clear_only_targeted_stores() {
    let _guard = runtime_control_lock().lock().await;
    let environment = TestEnvironment::new(true).await;
    environment.seed().await;
    environment.seed_unrelated_redis_key().await;

    let response = environment
        .post(serde_json::json!({
            "mode": "replay",
            "reset_state": true,
            "reset_storage": true
        }))
        .await;

    assert_eq!(response, StatusCode::OK);
    environment.assert_redis_absent().await;
    environment.assert_postgres_absent().await;
    environment.assert_unrelated_redis_key_present().await;
    environment.cleanup().await;
}

#[tokio::test]
#[ignore = "requires controlled PostgreSQL + Redis, DATABASE_URL, REDIS_URL, and applied migrations"]
async fn disabled_endpoint_rejects_explicit_resets_without_touching_stores() {
    let _guard = runtime_control_lock().lock().await;
    let environment = TestEnvironment::new(false).await;
    environment.seed().await;

    let response = environment
        .post(serde_json::json!({
            "mode": "replay",
            "reset_state": true,
            "reset_storage": true
        }))
        .await;

    assert_eq!(response, StatusCode::FORBIDDEN);
    environment.assert_redis_present().await;
    environment.assert_postgres_present().await;
    environment.cleanup().await;
}

struct TestEnvironment {
    app_state: AppState,
    cache: RedisCache,
    pool: PgPool,
    redis_url: String,
    replay_path: PathBuf,
    symbol: Symbol,
    unrelated_key: String,
}

impl TestEnvironment {
    async fn new(switching_supported: bool) -> Self {
        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL is required for runtime-control integration tests");
        let redis_url = std::env::var("REDIS_URL")
            .expect("REDIS_URL is required for runtime-control integration tests");
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await
            .expect("failed to connect to PostgreSQL");
        let cache = RedisCache::connect(&redis_url)
            .await
            .expect("failed to connect to Redis");
        let suffix = unique_suffix();
        let symbol = Symbol::new(format!("SGRT{suffix}")).unwrap();
        let replay_path = std::env::temp_dir().join(format!("signalguard-runtime-{suffix}.jsonl"));
        std::fs::write(&replay_path, "").expect("failed to create empty replay fixture");
        let counters = InternalCounters::default();
        let supervisor = Arc::new(IngestionSupervisor::new(
            &IngestionSettings {
                mode: IngestionMode::Replay,
                symbols: vec![symbol.clone()],
                replay_path: replay_path.clone(),
                replay_delay_ms: 0,
                replay_reset_state: false,
                replay_reset_storage: false,
                event_channel_capacity: 16,
            },
            &binance_settings(),
            &detector_settings(),
            switching_supported,
            pool.clone(),
            cache.clone(),
            counters.clone(),
        ));
        let app_state = AppState {
            pg_pool: pool.clone(),
            redis_cache: cache.clone(),
            detector_settings: detector_settings(),
            health_settings: health_settings(),
            runtime_mode: supervisor.runtime_mode_handle(),
            supervisor,
            counters,
        };

        Self {
            app_state,
            cache,
            pool,
            redis_url,
            replay_path,
            symbol,
            unrelated_key: format!("runtime-control:unrelated:{suffix}"),
        }
    }

    async fn seed(&self) {
        postgres::reset_replay_storage(&self.pool).await.unwrap();
        self.cache.clear_market_state_cache().await.unwrap();
        self.cache
            .set_market_state(&MarketState::new(self.symbol.clone()))
            .await
            .unwrap();
        insert_trade(&self.pool, &test_trade(self.symbol.clone()))
            .await
            .unwrap();
    }

    async fn post(&self, body: serde_json::Value) -> StatusCode {
        let response = api::router(self.app_state.clone())
            .oneshot(
                Request::post("/runtime/mode")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        response.status()
    }

    async fn assert_redis_present(&self) {
        assert!(
            self.cache
                .get_market_state(&self.symbol)
                .await
                .unwrap()
                .is_some()
        );
    }

    async fn assert_redis_absent(&self) {
        assert!(
            self.cache
                .get_market_state(&self.symbol)
                .await
                .unwrap()
                .is_none()
        );
    }

    async fn assert_postgres_present(&self) {
        assert_eq!(self.trade_count().await, 1);
    }

    async fn assert_postgres_absent(&self) {
        assert_eq!(self.trade_count().await, 0);
    }

    async fn trade_count(&self) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM trades WHERE symbol = $1")
            .bind(self.symbol.as_str())
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }

    async fn seed_unrelated_redis_key(&self) {
        let client = redis::Client::open(self.redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let (): () = connection
            .set(&self.unrelated_key, "keep-me")
            .await
            .unwrap();
    }

    async fn assert_unrelated_redis_key_present(&self) {
        let client = redis::Client::open(self.redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let value: Option<String> = connection.get(&self.unrelated_key).await.unwrap();
        assert_eq!(value.as_deref(), Some("keep-me"));
    }

    async fn cleanup(&self) {
        let _ = self.app_state.supervisor.shutdown_active_ingestion().await;
        postgres::reset_replay_storage(&self.pool).await.unwrap();
        self.cache.clear_market_state_cache().await.unwrap();
        let client = redis::Client::open(self.redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let _: usize = connection.del(&self.unrelated_key).await.unwrap();
        let _ = std::fs::remove_file(&self.replay_path);
    }
}

fn test_trade(symbol: Symbol) -> TradeEvent {
    TradeEvent::new(
        symbol,
        Exchange::Binance,
        Some(unique_suffix() as u64),
        Decimal::new(100, 0),
        Decimal::new(1, 0),
        Utc.with_ymd_and_hms(2026, 7, 20, 12, 0, 0).unwrap(),
        Utc.with_ymd_and_hms(2026, 7, 20, 12, 0, 1).unwrap(),
    )
    .unwrap()
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
}

fn binance_settings() -> BinanceSettings {
    BinanceSettings {
        websocket_base_url: String::from("ws://127.0.0.1:9"),
        reconnect_min_backoff_ms: 1,
        reconnect_max_backoff_ms: 2,
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

fn health_settings() -> HealthScoreSettings {
    HealthScoreSettings {
        base_score: 100,
        severity_penalties: SeverityPenaltySettings {
            info: 5,
            warning: 15,
            critical: 35,
        },
        stale_data_penalty: 25,
        recent_anomaly_window_secs: 300,
        status_thresholds: HealthStatusThresholds {
            healthy_min_score: 80,
            degraded_min_score: 50,
        },
    }
}

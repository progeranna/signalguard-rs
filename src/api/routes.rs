use axum::{Router, routing::get};

use super::handlers;

pub fn router() -> Router<super::AppState> {
    Router::new()
        .route("/health", get(handlers::health))
        .route(
            "/runtime/mode",
            get(handlers::runtime_mode).post(handlers::switch_runtime_mode),
        )
        .route("/metrics", get(handlers::metrics))
        .route("/pipeline/health", get(handlers::pipeline_health))
        .route("/dashboard/summary", get(handlers::dashboard_summary))
        .route("/symbols", get(handlers::symbols))
        .route("/market/{symbol}/state", get(handlers::market_state))
        .route("/market/{symbol}/health", get(handlers::market_health))
        .route("/anomalies", get(handlers::anomalies))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{
        body::Body,
        http::{Request, StatusCode, header},
        response::Response,
    };
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
    use tower::ServiceExt;

    use super::router;
    use crate::{
        api::AppState,
        config::{
            BinanceSettings, DetectorSettings, HealthScoreSettings, HealthStatusThresholds,
            IngestionMode, IngestionSettings, SeverityPenaltySettings,
        },
        runtime::RuntimeModeHandle,
        runtime::RuntimeModeSnapshot,
        runtime_supervisor::IngestionSupervisor,
        storage::RedisCache,
        telemetry::InternalCounters,
    };
    use chrono::TimeZone;
    use rust_decimal::Decimal;

    #[tokio::test]
    async fn health_route_returns_ok() {
        let response = get("/health", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn metrics_route_returns_ok() {
        let response = get("/metrics", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn runtime_mode_route_returns_ok() {
        let response = get("/runtime/mode", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn runtime_mode_route_returns_expected_fields() {
        let response = get("/runtime/mode", unavailable_state()).await;

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(body["mode"], "replay");
        assert_eq!(body["mode_label"], "Replay Demo");
        assert_eq!(body["status"], "running");
        assert_eq!(body["symbols"], serde_json::json!(["BTCUSDT"]));
        assert_eq!(body["switching_supported"], true);
        assert_eq!(body["source"], "config");
        assert!(body["last_started_at"].is_string());
        assert!(body["last_switched_at"].is_null());
        assert!(body["last_error"].is_null());
    }

    #[tokio::test]
    async fn runtime_mode_switch_route_rejects_invalid_mode() {
        let response = post(
            "/runtime/mode",
            serde_json::json!({
                "mode": "invalid",
                "reset_state": false,
                "reset_storage": false
            }),
            unavailable_state(),
        )
        .await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn metrics_route_returns_prometheus_metrics() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        counters.increment_binance_quote_events();

        let response = get(
            "/metrics",
            AppState {
                pg_pool: unused_test_pool(),
                redis_cache: RedisCache::unavailable(),
                detector_settings: detector_settings(),
                health_settings: health_settings(),
                runtime_mode: runtime_mode_handle(),
                supervisor: test_supervisor(),
                counters,
                test_recent_anomalies: None,
            },
        )
        .await;

        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "text/plain; version=0.0.4; charset=utf-8"
        );

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();

        assert!(body.contains("signalguard_parse_errors_total"));
        assert!(body.contains(
            "signalguard_events_processed_total{source=\"binance\",event_type=\"quote\"} 1"
        ));
    }

    #[tokio::test]
    async fn pipeline_health_route_returns_ok() {
        let response = get("/pipeline/health", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn pipeline_health_route_returns_expected_fields() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        let response = get(
            "/pipeline/health",
            AppState {
                pg_pool: unused_test_pool(),
                redis_cache: RedisCache::unavailable(),
                detector_settings: detector_settings(),
                health_settings: health_settings(),
                runtime_mode: runtime_mode_handle(),
                supervisor: test_supervisor(),
                counters,
                test_recent_anomalies: None,
            },
        )
        .await;

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();

        assert!(body.contains("\"status\""));
        assert!(body.contains("\"parse_errors\":1"));
        assert!(body.contains("\"reconnect_attempts\""));
        assert!(body.contains("\"storage_errors\""));
        assert!(body.contains("\"cache_errors\""));
    }

    #[tokio::test]
    async fn dashboard_summary_route_returns_ok() {
        let response = get("/dashboard/summary", dashboard_state()).await;

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert!(body.get("service").is_some());
        assert!(body.get("pipeline").is_some());
        assert!(body["symbols"].as_array().is_some());
        assert!(body["recent_anomalies"].as_array().is_some());
    }

    #[tokio::test]
    async fn symbols_route_reports_unavailable_cache() {
        let response = get("/symbols", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_state_route_reports_unavailable_cache() {
        let response = get("/market/BTCUSDT/state", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_health_route_reports_unavailable_cache() {
        let response = get("/market/BTCUSDT/health", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_health_route_rejects_invalid_symbol() {
        let response = get("/market/BTC-USDT/health", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_invalid_limit() {
        let response = get("/anomalies?limit=invalid", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_zero_limit() {
        let response = get("/anomalies?limit=0", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_limit_above_maximum() {
        let response = get("/anomalies?limit=501", unavailable_state()).await;

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    async fn get(path: &str, state: AppState) -> Response {
        router()
            .with_state(state)
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap()
    }

    async fn post(path: &str, body: serde_json::Value, state: AppState) -> Response {
        router()
            .with_state(state)
            .oneshot(
                Request::post(path)
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }

    fn unavailable_state() -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: detector_settings(),
            health_settings: health_settings(),
            runtime_mode: runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
        }
    }

    fn dashboard_state() -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::in_memory(Vec::new()),
            detector_settings: detector_settings(),
            health_settings: health_settings(),
            runtime_mode: runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: Some(Vec::new()),
        }
    }

    fn runtime_mode_snapshot() -> RuntimeModeSnapshot {
        RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &[crate::domain::Symbol::new("BTCUSDT").unwrap()],
            chrono::Utc.with_ymd_and_hms(2026, 7, 2, 12, 0, 0).unwrap(),
        )
    }

    fn runtime_mode_handle() -> RuntimeModeHandle {
        RuntimeModeHandle::new(runtime_mode_snapshot())
    }

    fn test_supervisor() -> Arc<IngestionSupervisor> {
        Arc::new(IngestionSupervisor::new(
            &IngestionSettings {
                mode: IngestionMode::Replay,
                symbols: vec![crate::domain::Symbol::new("BTCUSDT").unwrap()],
                replay_path: std::path::PathBuf::from("examples/replay/sample.jsonl"),
                replay_delay_ms: 0,
                replay_reset_storage: false,
                event_channel_capacity: 16,
            },
            &BinanceSettings {
                websocket_base_url: String::from("wss://stream.binance.com:9443"),
                reconnect_min_backoff_ms: 500,
                reconnect_max_backoff_ms: 5_000,
            },
            &detector_settings(),
            unused_test_pool(),
            RedisCache::in_memory(Vec::new()),
            InternalCounters::default(),
        ))
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
}

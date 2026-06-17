use axum::{Router, routing::get};

use super::handlers;

pub fn router() -> Router<super::AppState> {
    Router::new()
        .route("/health", get(handlers::health))
        .route("/metrics", get(handlers::metrics))
        .route("/pipeline/health", get(handlers::pipeline_health))
        .route("/symbols", get(handlers::symbols))
        .route("/market/{symbol}/state", get(handlers::market_state))
        .route("/market/{symbol}/health", get(handlers::market_health))
        .route("/anomalies", get(handlers::anomalies))
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode, header},
    };
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
    use tower::ServiceExt;

    use super::router;
    use crate::{
        api::AppState,
        config::{
            DetectorSettings, HealthScoreSettings, HealthStatusThresholds, SeverityPenaltySettings,
        },
        storage::RedisCache,
        telemetry::InternalCounters,
    };
    use rust_decimal::Decimal;

    #[tokio::test]
    async fn health_route_returns_ok() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn metrics_route_returns_ok() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(Request::get("/metrics").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn metrics_route_returns_prometheus_metrics() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        counters.increment_binance_quote_events();

        let response = router()
            .with_state(AppState {
                pg_pool: unused_test_pool(),
                redis_cache: RedisCache::unavailable(),
                detector_settings: detector_settings(),
                health_settings: health_settings(),
                counters,
            })
            .oneshot(Request::get("/metrics").body(Body::empty()).unwrap())
            .await
            .unwrap();

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
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/pipeline/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn pipeline_health_route_returns_expected_fields() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        let response = router()
            .with_state(AppState {
                pg_pool: unused_test_pool(),
                redis_cache: RedisCache::unavailable(),
                detector_settings: detector_settings(),
                health_settings: health_settings(),
                counters,
            })
            .oneshot(
                Request::get("/pipeline/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

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
    async fn symbols_route_reports_unavailable_cache() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(Request::get("/symbols").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_state_route_reports_unavailable_cache() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/market/BTCUSDT/state")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_health_route_reports_unavailable_cache() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/market/BTCUSDT/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn market_health_route_rejects_invalid_symbol() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/market/BTC-USDT/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_invalid_limit() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/anomalies?limit=invalid")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_zero_limit() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/anomalies?limit=0")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn anomalies_route_rejects_limit_above_maximum() {
        let response = router()
            .with_state(unavailable_state())
            .oneshot(
                Request::get("/anomalies?limit=501")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    fn unavailable_state() -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: detector_settings(),
            health_settings: health_settings(),
            counters: InternalCounters::default(),
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

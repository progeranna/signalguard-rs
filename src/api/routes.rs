use axum::{Router, routing::get};

use super::handlers;

pub fn router() -> Router<super::AppState> {
    Router::new()
        .route("/health", get(handlers::health))
        .route("/symbols", get(handlers::symbols))
        .route("/market/{symbol}/state", get(handlers::market_state))
        .route("/market/{symbol}/health", get(handlers::market_health))
        .route("/anomalies", get(handlers::anomalies))
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
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

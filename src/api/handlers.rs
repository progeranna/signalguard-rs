use axum::{
    Json,
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
};
use chrono::Utc;
use serde::Deserialize;

use crate::{
    domain::{MarketState, Symbol},
    health::{HealthScoringInput, evaluate_health},
    state,
    storage::{CacheError, StorageError, get_recent_anomalies},
    telemetry::render_prometheus_metrics,
};

use super::{
    dto::{
        AnomaliesResponse, AnomalyResponse, HealthResponse, MarketHealthResponse,
        MarketStateResponse, PipelineHealthResponse, SymbolsResponse,
    },
    error::ApiError,
    state::AppState,
};

const DEFAULT_ANOMALY_LIMIT: u32 = 50;
const MAX_ANOMALY_LIMIT: u32 = 500;
const HEALTH_ANOMALY_LIMIT: u32 = 100;

#[derive(Debug, Deserialize)]
pub struct AnomaliesQuery {
    pub symbol: Option<String>,
    pub limit: Option<String>,
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "signalguard-rs",
    })
}

pub async fn pipeline_health(State(state): State<AppState>) -> Json<PipelineHealthResponse> {
    Json(PipelineHealthResponse::from_snapshot(
        &state.counters.snapshot_at(Utc::now()),
    ))
}

pub async fn metrics(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.counters.snapshot_at(Utc::now());
    let body = render_prometheus_metrics(&snapshot);

    (
        [(
            header::CONTENT_TYPE,
            "text/plain; version=0.0.4; charset=utf-8",
        )],
        body,
    )
}

pub async fn symbols(State(state): State<AppState>) -> Result<Json<SymbolsResponse>, ApiError> {
    let symbols = state
        .redis_cache
        .list_symbols()
        .await
        .map_err(|error| map_cache_error(&state, error))?
        .into_iter()
        .map(|symbol| symbol.as_str().to_owned())
        .collect();

    Ok(Json(SymbolsResponse { symbols }))
}

pub async fn market_state(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> Result<Json<MarketStateResponse>, ApiError> {
    let symbol = Symbol::new(symbol)
        .map_err(|error| ApiError::InvalidSymbol(format!("invalid market symbol: {error}")))?;
    let state_snapshot = load_market_state(&state, &symbol).await?;

    Ok(Json(MarketStateResponse::from_market_state(
        state_snapshot,
        state::snapshot_now(),
    )))
}

pub async fn market_health(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
) -> Result<Json<MarketHealthResponse>, ApiError> {
    let symbol = Symbol::new(symbol)
        .map_err(|error| ApiError::InvalidSymbol(format!("invalid market symbol: {error}")))?;
    let now = state::snapshot_now();
    let state_snapshot = load_market_state(&state, &symbol).await?;
    let anomalies = get_recent_anomalies(&state.pg_pool, Some(&symbol), HEALTH_ANOMALY_LIMIT)
        .await
        .map_err(|error| map_storage_error(&state, error))?;
    let evaluation = evaluate_health(HealthScoringInput {
        state: &state_snapshot,
        anomalies: &anomalies,
        now,
        settings: &state.health_settings,
        stale_data_ms_threshold: state.detector_settings.stale_data_ms_threshold,
    });

    Ok(Json(MarketHealthResponse::from_evaluation(
        symbol.as_str().to_owned(),
        evaluation,
    )))
}

pub async fn anomalies(
    State(state): State<AppState>,
    Query(query): Query<AnomaliesQuery>,
) -> Result<Json<AnomaliesResponse>, ApiError> {
    let (symbol, limit) = parse_anomalies_query(query)?;
    let anomalies = get_recent_anomalies(&state.pg_pool, symbol.as_ref(), limit)
        .await
        .map_err(|error| map_storage_error(&state, error))?;

    Ok(Json(AnomaliesResponse {
        anomalies: anomalies
            .into_iter()
            .map(AnomalyResponse::from_anomaly)
            .collect(),
    }))
}

async fn load_market_state(state: &AppState, symbol: &Symbol) -> Result<MarketState, ApiError> {
    state
        .redis_cache
        .get_market_state(symbol)
        .await
        .map_err(|error| map_cache_error(state, error))?
        .ok_or_else(|| {
            ApiError::NotFound(format!(
                "no market state found for symbol {}",
                symbol.as_str()
            ))
        })
}

fn map_cache_error(state: &AppState, error: CacheError) -> ApiError {
    state.counters.increment_cache_errors();
    ApiError::from(error)
}

fn map_storage_error(state: &AppState, error: StorageError) -> ApiError {
    if !matches!(error, StorageError::InvalidArgument { .. }) {
        state.counters.increment_storage_errors();
    }

    ApiError::from(error)
}

fn parse_anomalies_query(query: AnomaliesQuery) -> Result<(Option<Symbol>, u32), ApiError> {
    let symbol = query
        .symbol
        .map(|value| {
            Symbol::new(value).map_err(|error| {
                ApiError::InvalidSymbol(format!("invalid anomaly symbol: {error}"))
            })
        })
        .transpose()?;
    let limit = query
        .limit
        .as_deref()
        .map(parse_anomaly_limit)
        .transpose()?
        .unwrap_or(DEFAULT_ANOMALY_LIMIT);

    Ok((symbol, limit))
}

fn parse_anomaly_limit(value: &str) -> Result<u32, ApiError> {
    let limit = value.parse::<u32>().map_err(|_| {
        ApiError::InvalidRequest(format!(
            "invalid anomalies limit `{value}`: expected a positive integer"
        ))
    })?;

    if limit == 0 {
        return Err(ApiError::InvalidRequest(String::from(
            "anomalies limit must be greater than zero",
        )));
    }
    if limit > MAX_ANOMALY_LIMIT {
        return Err(ApiError::InvalidRequest(format!(
            "anomalies limit must be less than or equal to {MAX_ANOMALY_LIMIT}"
        )));
    }

    Ok(limit)
}

#[cfg(test)]
mod tests {
    use axum::extract::{Path, State};
    use axum::response::IntoResponse;
    use chrono::{Duration, TimeZone, Utc};
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

    use super::{
        AnomaliesQuery, anomalies, market_health, market_state, metrics, parse_anomalies_query,
        pipeline_health, symbols,
    };
    use crate::api::AppState;
    use crate::config::{
        DetectorSettings, HealthScoreSettings, HealthStatusThresholds, SeverityPenaltySettings,
    };
    use crate::domain::{MarketSignals, MarketState, Symbol};
    use crate::storage::RedisCache;
    use crate::telemetry::InternalCounters;
    use rust_decimal::Decimal;

    #[tokio::test]
    async fn symbols_returns_service_unavailable_when_cache_is_down() {
        let state = unavailable_state();
        let error = symbols(State(state)).await.unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::CacheUnavailable
        ));
    }

    #[tokio::test]
    async fn market_state_rejects_invalid_symbols() {
        let state = unavailable_state();
        let error = market_state(State(state), Path(String::from("BTC-USDT")))
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::InvalidSymbol(_)
        ));
    }

    #[tokio::test]
    async fn market_health_returns_service_unavailable_when_cache_is_down() {
        let state = unavailable_state();
        let error = market_health(State(state), Path(String::from("BTCUSDT")))
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::CacheUnavailable
        ));
    }

    #[tokio::test]
    async fn market_health_rejects_invalid_symbols() {
        let state = unavailable_state();
        let error = market_health(State(state), Path(String::from("BTC-USDT")))
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::InvalidSymbol(_)
        ));
    }

    #[tokio::test]
    async fn market_health_returns_not_found_when_state_is_missing() {
        let state = AppState {
            pg_pool: failing_storage_pool(),
            redis_cache: RedisCache::in_memory(Vec::new()),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters: InternalCounters::default(),
        };
        let error = market_health(State(state), Path(String::from("BTCUSDT")))
            .await
            .unwrap_err();

        assert!(matches!(error, crate::api::error::ApiError::NotFound(_)));
    }

    #[tokio::test]
    async fn market_health_returns_storage_errors_as_internal() {
        let state = AppState {
            pg_pool: failing_storage_pool(),
            redis_cache: RedisCache::in_memory(vec![test_market_state()]),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters: InternalCounters::default(),
        };
        let error = market_health(State(state), Path(String::from("BTCUSDT")))
            .await
            .unwrap_err();

        assert!(matches!(error, crate::api::error::ApiError::Internal(_)));
    }

    #[tokio::test]
    async fn anomalies_returns_storage_errors_as_internal() {
        let state = AppState {
            pg_pool: failing_storage_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters: InternalCounters::default(),
        };
        let error = anomalies(
            State(state),
            axum::extract::Query(AnomaliesQuery {
                symbol: None,
                limit: Some(String::from("50")),
            }),
        )
        .await
        .unwrap_err();

        assert!(matches!(error, crate::api::error::ApiError::Internal(_)));
    }

    #[tokio::test]
    async fn metrics_handler_returns_ok_without_external_services() {
        let response = metrics(State(unavailable_state())).await.into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn metrics_handler_contains_parse_error_metric() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        counters.increment_replay_trade_events();
        counters.record_message_at(fixed_now() - Duration::seconds(1));
        let response = metrics(State(AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters,
        }))
        .await
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();

        assert!(body.contains("signalguard_parse_errors_total"));
        assert!(body.contains(
            "signalguard_events_processed_total{source=\"replay\",event_type=\"trade\"} 1"
        ));
    }

    #[tokio::test]
    async fn pipeline_health_handler_returns_ok_without_external_services() {
        let response = pipeline_health(State(unavailable_state()))
            .await
            .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn pipeline_health_handler_response_contains_expected_fields() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();
        counters.increment_storage_errors();
        counters.record_message_at(fixed_now());
        let response = pipeline_health(State(AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters,
        }))
        .await
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();

        assert!(body.contains("\"status\""));
        assert!(body.contains("\"last_message_age_ms\""));
        assert!(body.contains("\"parse_errors\""));
        assert!(body.contains("\"reconnect_attempts\""));
        assert!(body.contains("\"storage_errors\""));
        assert!(body.contains("\"cache_errors\""));
    }

    #[test]
    fn anomalies_query_defaults_limit() {
        let (symbol, limit) = parse_anomalies_query(AnomaliesQuery {
            symbol: None,
            limit: None,
        })
        .unwrap();

        assert!(symbol.is_none());
        assert_eq!(limit, 50);
    }

    #[test]
    fn anomalies_query_accepts_explicit_valid_limit() {
        let (symbol, limit) = parse_anomalies_query(AnomaliesQuery {
            symbol: Some(String::from("BTCUSDT")),
            limit: Some(String::from("25")),
        })
        .unwrap();

        assert_eq!(symbol.unwrap().as_str(), "BTCUSDT");
        assert_eq!(limit, 25);
    }

    #[test]
    fn anomalies_query_rejects_invalid_limit() {
        let error = parse_anomalies_query(AnomaliesQuery {
            symbol: None,
            limit: Some(String::from("abc")),
        })
        .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::InvalidRequest(_)
        ));
    }

    #[test]
    fn anomalies_query_rejects_out_of_range_limits() {
        for limit in ["0", "501"] {
            let error = parse_anomalies_query(AnomaliesQuery {
                symbol: None,
                limit: Some(String::from(limit)),
            })
            .unwrap_err();

            assert!(matches!(
                error,
                crate::api::error::ApiError::InvalidRequest(_)
            ));
        }
    }

    #[test]
    fn anomalies_query_rejects_invalid_symbol() {
        let error = parse_anomalies_query(AnomaliesQuery {
            symbol: Some(String::from("BTC-USDT")),
            limit: None,
        })
        .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::InvalidSymbol(_)
        ));
    }

    fn unavailable_state() -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::unavailable(),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            counters: InternalCounters::default(),
        }
    }

    fn test_market_state() -> MarketState {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_event_time = Some(chrono::Utc::now());
        state.signals = MarketSignals {
            spread_pct: Some(0.1),
            price_change_1m_pct: Some(0.2),
            trades_per_minute: Some(10.0),
        };
        state
    }

    fn test_detector_settings() -> DetectorSettings {
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

    fn test_health_settings() -> HealthScoreSettings {
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

    fn fixed_now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
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

    fn failing_storage_pool() -> sqlx::PgPool {
        PgPoolOptions::new().max_connections(1).connect_lazy_with(
            PgConnectOptions::new()
                .host("/tmp/signalguard-rs-test-unreachable-postgres")
                .username("signalguard")
                .password("signalguard")
                .database("signalguard"),
        )
    }
}

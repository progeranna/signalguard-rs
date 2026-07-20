use axum::{
    Json,
    extract::{Path, Query, State},
    http::header,
    response::IntoResponse,
};
use chrono::Utc;
use serde::Deserialize;

use crate::{
    domain::{AnomalyEvent, MarketState, Symbol},
    health::{HealthScoringInput, evaluate_health},
    state,
    storage::{
        CacheError, MAX_RECENT_ANOMALY_LIMIT as MAX_ANOMALY_LIMIT, StorageError,
        get_recent_anomalies, get_recent_trades_for_symbol,
    },
    telemetry::render_prometheus_metrics,
};

use super::{
    demo_data,
    dto::{
        AnomaliesResponse, AnomalyResponse, DashboardHealthSummary, DashboardServiceSummary,
        DashboardStateSummary, DashboardSummaryResponse, DashboardSymbolSummary, HealthResponse,
        MarketHealthResponse, MarketStateResponse, MarketTimelinePointResponse,
        MarketTimelineResponse, PipelineHealthResponse, PublicDataMode, PublicDataModeQuery,
        RuntimeModeResponse, RuntimeModeSwitchRequest, SymbolsResponse,
    },
    error::ApiError,
    state::AppState,
};
use crate::runtime_supervisor::{RuntimeModeSwitchCommand, SwitchModeError};

const DEFAULT_ANOMALY_LIMIT: u32 = 50;
const HEALTH_ANOMALY_LIMIT: u32 = 100;
const MARKET_TIMELINE_POINT_LIMIT: u32 = 120;
const MARKET_TIMELINE_ANOMALY_LIMIT: u32 = 50;

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

pub async fn runtime_mode(State(state): State<AppState>) -> Json<RuntimeModeResponse> {
    Json(RuntimeModeResponse::from_snapshot(
        &state.runtime_mode.snapshot(),
    ))
}

pub async fn switch_runtime_mode(
    State(state): State<AppState>,
    Json(request): Json<RuntimeModeSwitchRequest>,
) -> Result<Json<RuntimeModeResponse>, ApiError> {
    if !state.enable_runtime_switch {
        return Err(ApiError::Forbidden(String::from(
            "runtime mode switching is disabled",
        )));
    }

    let snapshot = state
        .supervisor
        .switch_mode(RuntimeModeSwitchCommand {
            mode: request.mode,
            symbols: request.symbols,
            reset_state: request.reset_state,
            reset_storage: request.reset_storage,
        })
        .await
        .map_err(map_switch_error)?;

    Ok(Json(RuntimeModeResponse::from_snapshot(&snapshot)))
}

pub async fn dashboard_summary(
    State(state): State<AppState>,
    Query(query): Query<PublicDataModeQuery>,
) -> Result<Json<DashboardSummaryResponse>, ApiError> {
    let mode = query.resolved_mode();
    if mode == PublicDataMode::Demo {
        return Ok(Json(demo_data::dashboard_summary(
            &state.health_settings,
            &state.detector_settings,
        )));
    }

    live_dashboard_summary(&state).await.map(Json)
}

async fn live_dashboard_summary(state: &AppState) -> Result<DashboardSummaryResponse, ApiError> {
    let symbols = state
        .redis_cache
        .list_symbols()
        .await
        .map_err(|error| map_cache_error(state, error))?;
    let recent_anomalies = load_dashboard_recent_anomalies(state).await?;
    let now = state::snapshot_now();
    let symbol_summaries =
        load_dashboard_symbol_summaries(state, symbols, &recent_anomalies, now).await?;

    Ok(build_dashboard_summary_response(
        state,
        symbol_summaries,
        recent_anomalies,
        now,
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
    let symbol = parse_market_symbol(symbol)?;
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
    let symbol = parse_market_symbol(symbol)?;
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

pub async fn market_timeline(
    State(state): State<AppState>,
    Path(symbol): Path<String>,
    Query(query): Query<PublicDataModeQuery>,
) -> Result<Json<MarketTimelineResponse>, ApiError> {
    let mode = query.resolved_mode();
    let symbol = parse_market_symbol(symbol)?;
    if mode == PublicDataMode::Demo {
        return Ok(Json(demo_data::market_timeline(&symbol)));
    }

    Ok(Json(live_market_timeline(&state, &symbol).await?))
}

async fn live_market_timeline(
    state: &AppState,
    symbol: &Symbol,
) -> Result<MarketTimelineResponse, ApiError> {
    let now = state::snapshot_now();
    let trades = load_market_timeline_trades(state, symbol).await?;
    let mut anomalies = load_market_timeline_anomalies(state, symbol).await?;
    anomalies.sort_by(|left, right| {
        left.event_time
            .cmp(&right.event_time)
            .then_with(|| left.created_at.cmp(&right.created_at))
    });

    Ok(MarketTimelineResponse {
        symbol: symbol.as_str().to_owned(),
        points: trades
            .iter()
            .map(|trade| MarketTimelinePointResponse::from_trade(trade, now))
            .collect(),
        anomalies: anomalies
            .into_iter()
            .map(AnomalyResponse::from_anomaly)
            .collect(),
    })
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

fn parse_market_symbol(symbol: String) -> Result<Symbol, ApiError> {
    Symbol::new(symbol)
        .map_err(|error| ApiError::InvalidSymbol(format!("invalid market symbol: {error}")))
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

fn map_switch_error(error: SwitchModeError) -> ApiError {
    match error {
        SwitchModeError::Validation(message) => ApiError::InvalidRequest(message),
        SwitchModeError::Conflict => {
            ApiError::Conflict(String::from("runtime mode switch is already in progress"))
        }
        SwitchModeError::Execution(error) => {
            tracing::warn!(%error, "runtime mode switch failed");
            ApiError::Internal(String::from("failed to switch runtime mode"))
        }
    }
}

async fn load_dashboard_recent_anomalies(state: &AppState) -> Result<Vec<AnomalyEvent>, ApiError> {
    #[cfg(test)]
    if let Some(anomalies) = &state.test_recent_anomalies {
        return Ok(anomalies.clone());
    }

    get_recent_anomalies(&state.pg_pool, None, DEFAULT_ANOMALY_LIMIT)
        .await
        .map_err(|error| map_storage_error(state, error))
}

async fn load_market_timeline_trades(
    state: &AppState,
    symbol: &Symbol,
) -> Result<Vec<crate::domain::TradeEvent>, ApiError> {
    #[cfg(test)]
    if let Some(trades) = &state.test_recent_trades {
        return Ok(trades.clone());
    }

    get_recent_trades_for_symbol(&state.pg_pool, symbol, MARKET_TIMELINE_POINT_LIMIT)
        .await
        .map_err(|error| map_storage_error(state, error))
}

async fn load_market_timeline_anomalies(
    state: &AppState,
    symbol: &Symbol,
) -> Result<Vec<AnomalyEvent>, ApiError> {
    #[cfg(test)]
    if let Some(anomalies) = &state.test_recent_anomalies {
        return Ok(anomalies
            .iter()
            .filter(|anomaly| anomaly.symbol == *symbol)
            .cloned()
            .collect());
    }

    get_recent_anomalies(&state.pg_pool, Some(symbol), MARKET_TIMELINE_ANOMALY_LIMIT)
        .await
        .map_err(|error| map_storage_error(state, error))
}

fn build_dashboard_summary_response(
    state: &AppState,
    symbols: Vec<DashboardSymbolSummary>,
    recent_anomalies: Vec<AnomalyEvent>,
    now: chrono::DateTime<Utc>,
) -> DashboardSummaryResponse {
    let pipeline = PipelineHealthResponse::from_snapshot(&state.counters.snapshot_at(now));

    DashboardSummaryResponse {
        service: DashboardServiceSummary {
            status: "ok",
            service: "signalguard-rs",
        },
        pipeline,
        symbols,
        recent_anomalies: recent_anomalies
            .into_iter()
            .map(AnomalyResponse::from_anomaly)
            .collect(),
    }
}

async fn load_dashboard_symbol_summaries(
    state: &AppState,
    symbols: Vec<Symbol>,
    recent_anomalies: &[AnomalyEvent],
    now: chrono::DateTime<Utc>,
) -> Result<Vec<DashboardSymbolSummary>, ApiError> {
    let mut summaries = Vec::with_capacity(symbols.len());

    for symbol in symbols {
        let market_state = state
            .redis_cache
            .get_market_state(&symbol)
            .await
            .map_err(|error| map_cache_error(state, error))?;
        let (state_summary, health_summary) = if let Some(market_state) = market_state.as_ref() {
            let symbol_anomalies = recent_anomalies
                .iter()
                .filter(|anomaly| anomaly.symbol == symbol)
                .cloned()
                .collect::<Vec<_>>();
            let evaluation = evaluate_health(HealthScoringInput {
                state: market_state,
                anomalies: &symbol_anomalies,
                now,
                settings: &state.health_settings,
                stale_data_ms_threshold: state.detector_settings.stale_data_ms_threshold,
            });

            (
                Some(DashboardStateSummary::from_market_state(market_state, now)),
                Some(DashboardHealthSummary::from_evaluation(evaluation)),
            )
        } else {
            (None, None)
        };

        summaries.push(DashboardSymbolSummary {
            symbol: symbol.as_str().to_owned(),
            state: state_summary,
            health: health_summary,
        });
    }

    Ok(summaries)
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
    use std::sync::Arc;

    use axum::extract::{Path, Query, State};
    use axum::response::IntoResponse;
    use chrono::{Duration, TimeZone, Utc};
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

    use super::{
        AnomaliesQuery, anomalies, dashboard_summary, market_health, market_state, market_timeline,
        metrics, parse_anomalies_query, pipeline_health, runtime_mode, switch_runtime_mode,
        symbols,
    };
    use crate::api::AppState;
    use crate::api::dto::{PublicDataMode, PublicDataModeQuery, RuntimeModeSwitchRequest};
    use crate::config::{
        BinanceSettings, DetectorSettings, HealthScoreSettings, HealthStatusThresholds,
        IngestionMode, IngestionSettings, SeverityPenaltySettings,
    };
    use crate::domain::{
        AnomalyEvent, AnomalyMeasurement, AnomalyType, Exchange, MarketSignals, MarketState,
        Severity, Symbol, TradeEvent,
    };
    use crate::runtime::RuntimeModeSnapshot;
    use crate::runtime_supervisor::IngestionSupervisor;
    use crate::storage::RedisCache;
    use crate::telemetry::InternalCounters;
    use axum::Json;
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
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
    async fn runtime_mode_handler_returns_startup_snapshot() {
        let response = runtime_mode(State(unavailable_state()))
            .await
            .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);

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
    async fn switch_runtime_mode_rejects_empty_live_symbols() {
        let mut state = unavailable_state();
        state.enable_runtime_switch = true;

        let error = switch_runtime_mode(
            State(state),
            Json(RuntimeModeSwitchRequest {
                mode: String::from("live"),
                symbols: Some(Vec::new()),
                reset_state: Some(false),
                reset_storage: Some(false),
            }),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::InvalidRequest(_)
        ));
    }

    #[tokio::test]
    async fn switch_runtime_mode_returns_forbidden_when_disabled() {
        let error = switch_runtime_mode(
            State(unavailable_state()),
            Json(RuntimeModeSwitchRequest {
                mode: String::from("live"),
                symbols: Some(vec![String::from("BTCUSDT")]),
                reset_state: Some(false),
                reset_storage: Some(false),
            }),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::Forbidden(message)
            if message == "runtime mode switching is disabled"
        ));
    }

    #[tokio::test]
    async fn switch_runtime_mode_succeeds_when_enabled() {
        let mut state = unavailable_state();
        state.enable_runtime_switch = true;

        let response = switch_runtime_mode(
            State(state),
            Json(RuntimeModeSwitchRequest {
                mode: String::from("live"),
                symbols: Some(vec![String::from("BTCUSDT")]),
                reset_state: Some(false),
                reset_storage: Some(false),
            }),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(body["mode"], "live");
        assert_eq!(body["symbols"], serde_json::json!(["BTCUSDT"]));
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters,
            test_recent_anomalies: None,
            test_recent_trades: None,
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters,
            test_recent_anomalies: None,
            test_recent_trades: None,
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

    #[tokio::test]
    async fn dashboard_summary_handler_returns_empty_arrays_for_empty_sources() {
        let response = dashboard_summary(
            State(dashboard_state(Vec::new(), Vec::new())),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(body["service"]["service"], "signalguard-rs");
        assert_eq!(body["service"]["status"], "ok");
        assert!(body.get("pipeline").is_some());
        assert!(body["symbols"].as_array().is_some());
        assert!(body["recent_anomalies"].as_array().is_some());
        assert!(body["symbols"].as_array().unwrap().is_empty());
        assert!(body["recent_anomalies"].as_array().unwrap().is_empty());
    }

    #[tokio::test]
    async fn dashboard_summary_handler_includes_tracked_symbols() {
        let response = dashboard_summary(
            State(dashboard_state(
                vec![test_market_state(), test_market_state_for("ETHUSDT")],
                Vec::new(),
            )),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let symbols = body["symbols"].as_array().unwrap();

        assert_eq!(symbols.len(), 2);
        assert_eq!(symbols[0]["symbol"], "BTCUSDT");
        assert!(symbols[0]["state"].is_object());
        assert!(symbols[0]["health"].is_object());
        assert_eq!(symbols[1]["symbol"], "ETHUSDT");
    }

    #[tokio::test]
    async fn dashboard_summary_handler_includes_state_summary_for_symbol_state() {
        let mut state = test_market_state();
        state.last_trade_price = Some(Decimal::new(6505425, 2));
        state.best_bid_price = Some(Decimal::new(6504800, 2));
        state.best_ask_price = Some(Decimal::new(6505500, 2));
        state.depth_sequence_gap_count = 2;
        let response = dashboard_summary(
            State(dashboard_state(vec![state], Vec::new())),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let state = &body["symbols"][0]["state"];

        assert_eq!(state["last_trade_price"], "65054.25");
        assert_eq!(state["best_bid_price"], "65048.00");
        assert_eq!(state["best_ask_price"], "65055.00");
        assert_eq!(state["spread_pct"], 0.1);
        assert_eq!(state["price_change_1m_pct"], 0.2);
        assert_eq!(state["trades_per_minute"], 10.0);
        assert_eq!(state["depth_sequence_gap_count"], 2);
        assert!(state["last_event_time"].is_string());
        assert!(state["last_event_age_ms"].is_number());
    }

    #[tokio::test]
    async fn dashboard_summary_handler_keeps_missing_symbol_state_null() {
        let state = AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::in_memory_with_symbols(
                vec![Symbol::new("BTCUSDT").unwrap()],
                Vec::new(),
            ),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: Some(Vec::new()),
            test_recent_trades: None,
        };
        let response = dashboard_summary(State(state), Query(live_public_data_mode_query()))
            .await
            .unwrap()
            .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let symbol = &body["symbols"][0];

        assert_eq!(symbol["symbol"], "BTCUSDT");
        assert!(symbol["state"].is_null());
        assert!(symbol["health"].is_null());
    }

    #[tokio::test]
    async fn dashboard_summary_handler_includes_health_summary_for_symbol_state() {
        let response = dashboard_summary(
            State(dashboard_state(vec![test_market_state()], Vec::new())),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let health = &body["symbols"][0]["health"];

        assert_eq!(health["score"], 100);
        assert_eq!(health["status"], "healthy");
        assert_eq!(health["recent_anomaly_count"], 0);
        assert!(health["evaluated_at"].is_string());
    }

    #[tokio::test]
    async fn dashboard_summary_handler_health_summary_uses_relevant_recent_anomalies() {
        let response = dashboard_summary(
            State(dashboard_state(
                vec![test_market_state(), test_market_state_for("ETHUSDT")],
                vec![test_recent_anomaly("BTCUSDT")],
            )),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let btc_health = &body["symbols"][0]["health"];
        let eth_health = &body["symbols"][1]["health"];

        assert_eq!(btc_health["score"], 85);
        assert_eq!(btc_health["status"], "healthy");
        assert_eq!(btc_health["recent_anomaly_count"], 1);
        assert_eq!(eth_health["score"], 100);
        assert_eq!(eth_health["recent_anomaly_count"], 0);
    }

    #[tokio::test]
    async fn dashboard_summary_handler_includes_recent_anomalies() {
        let anomaly = test_anomaly("BTCUSDT");
        let response = dashboard_summary(
            State(dashboard_state(Vec::new(), vec![anomaly])),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
        let anomalies = body["recent_anomalies"].as_array().unwrap();

        assert_eq!(anomalies.len(), 1);
        assert!(anomalies[0]["id"].is_string());
        assert_eq!(anomalies[0]["symbol"], "BTCUSDT");
        assert_eq!(anomalies[0]["anomaly_type"], "spread_spike");
        assert_eq!(anomalies[0]["severity"], "warning");
        assert_eq!(anomalies[0]["message"], "spread widened beyond baseline");
        assert_eq!(anomalies[0]["observed_value"], 0.9);
        assert_eq!(anomalies[0]["threshold_value"], 0.5);
        assert_eq!(anomalies[0]["event_time"], "2026-01-01T00:00:00Z");
        assert_eq!(anomalies[0]["created_at"], "2026-01-01T00:00:00Z");
    }

    #[tokio::test]
    async fn dashboard_summary_handler_returns_cache_errors() {
        let error = dashboard_summary(
            State(unavailable_state()),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::CacheUnavailable
        ));
    }

    #[tokio::test]
    async fn dashboard_summary_handler_returns_cache_errors_from_state_reads() {
        let state = AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::in_memory_symbols_only(vec![Symbol::new("BTCUSDT").unwrap()]),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: Some(Vec::new()),
            test_recent_trades: None,
        };
        let error = dashboard_summary(State(state), Query(live_public_data_mode_query()))
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            crate::api::error::ApiError::CacheUnavailable
        ));
    }

    #[tokio::test]
    async fn dashboard_summary_handler_returns_storage_errors() {
        let state = AppState {
            pg_pool: failing_storage_pool(),
            redis_cache: RedisCache::in_memory(Vec::new()),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
        };
        let error = dashboard_summary(State(state), Query(live_public_data_mode_query()))
            .await
            .unwrap_err();

        assert!(matches!(error, crate::api::error::ApiError::Internal(_)));
    }

    #[tokio::test]
    async fn dashboard_summary_accepts_demo_mode_query() {
        let response = dashboard_summary(
            State(dashboard_state(Vec::new(), Vec::new())),
            Query(PublicDataModeQuery {
                mode: Some(PublicDataMode::Demo),
            }),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn dashboard_summary_accepts_live_mode_query() {
        let response = dashboard_summary(
            State(dashboard_state(Vec::new(), Vec::new())),
            Query(PublicDataModeQuery {
                mode: Some(PublicDataMode::Live),
            }),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn market_timeline_accepts_demo_mode_query() {
        let response = market_timeline(
            State(timeline_state(vec![test_trade("BTCUSDT")])),
            Path(String::from("BTCUSDT")),
            Query(PublicDataModeQuery {
                mode: Some(PublicDataMode::Demo),
            }),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn market_timeline_accepts_live_mode_query() {
        let response = market_timeline(
            State(timeline_state(vec![test_trade("BTCUSDT")])),
            Path(String::from("BTCUSDT")),
            Query(PublicDataModeQuery {
                mode: Some(PublicDataMode::Live),
            }),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn market_timeline_missing_mode_defaults_to_demo() {
        let response = market_timeline(
            State(timeline_state(vec![test_trade("BTCUSDT")])),
            Path(String::from("BTCUSDT")),
            Query(default_public_data_mode_query()),
        )
        .await
        .unwrap()
        .into_response();

        assert_eq!(response.status(), axum::http::StatusCode::OK);
    }

    #[tokio::test]
    async fn market_timeline_returns_storage_errors_as_internal() {
        let state = AppState {
            pg_pool: failing_storage_pool(),
            redis_cache: RedisCache::in_memory(Vec::new()),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
        };
        let error = market_timeline(
            State(state),
            Path(String::from("BTCUSDT")),
            Query(live_public_data_mode_query()),
        )
        .await
        .unwrap_err();

        assert!(matches!(error, crate::api::error::ApiError::Internal(_)));
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
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: None,
            test_recent_trades: None,
        }
    }

    fn test_market_state() -> MarketState {
        test_market_state_for("BTCUSDT")
    }

    fn test_market_state_for(symbol: &str) -> MarketState {
        let mut state = MarketState::new(Symbol::new(symbol).unwrap());
        state.last_event_time = Some(chrono::Utc::now());
        state.signals = MarketSignals {
            spread_pct: Some(0.1),
            price_change_1m_pct: Some(0.2),
            trades_per_minute: Some(10.0),
        };
        state
    }

    fn dashboard_state(states: Vec<MarketState>, anomalies: Vec<AnomalyEvent>) -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::in_memory(states),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: Some(anomalies),
            test_recent_trades: None,
        }
    }

    fn timeline_state(trades: Vec<TradeEvent>) -> AppState {
        AppState {
            pg_pool: unused_test_pool(),
            redis_cache: RedisCache::in_memory(Vec::new()),
            detector_settings: test_detector_settings(),
            health_settings: test_health_settings(),
            enable_runtime_switch: false,
            runtime_mode: test_runtime_mode_handle(),
            supervisor: test_supervisor(),
            counters: InternalCounters::default(),
            test_recent_anomalies: Some(Vec::new()),
            test_recent_trades: Some(trades),
        }
    }

    fn test_runtime_mode_snapshot() -> RuntimeModeSnapshot {
        RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &[Symbol::new("BTCUSDT").unwrap()],
            fixed_now(),
        )
    }

    fn test_runtime_mode_handle() -> crate::runtime::RuntimeModeHandle {
        crate::runtime::RuntimeModeHandle::new(test_runtime_mode_snapshot())
    }

    fn test_supervisor() -> Arc<IngestionSupervisor> {
        Arc::new(IngestionSupervisor::new(
            &IngestionSettings {
                mode: IngestionMode::Replay,
                symbols: vec![Symbol::new("BTCUSDT").unwrap()],
                replay_path: std::path::PathBuf::from("examples/replay/sample.jsonl"),
                replay_delay_ms: 0,
                replay_reset_state: true,
                replay_reset_storage: false,
                event_channel_capacity: 16,
            },
            &BinanceSettings {
                websocket_base_url: String::from("wss://stream.binance.com:9443"),
                reconnect_min_backoff_ms: 500,
                reconnect_max_backoff_ms: 5_000,
            },
            &test_detector_settings(),
            unused_test_pool(),
            RedisCache::in_memory(Vec::new()),
            InternalCounters::default(),
        ))
    }

    fn test_anomaly(symbol: &str) -> AnomalyEvent {
        AnomalyEvent::new(
            Symbol::new(symbol).unwrap(),
            AnomalyType::SpreadSpike,
            Severity::Warning,
            "spread widened beyond baseline",
            AnomalyMeasurement {
                observed_value: Some(0.9),
                threshold_value: Some(0.5),
            },
            fixed_now(),
            fixed_now(),
        )
    }

    fn test_recent_anomaly(symbol: &str) -> AnomalyEvent {
        let now = chrono::Utc::now();

        AnomalyEvent::new(
            Symbol::new(symbol).unwrap(),
            AnomalyType::SpreadSpike,
            Severity::Warning,
            "spread widened beyond baseline",
            AnomalyMeasurement {
                observed_value: Some(0.9),
                threshold_value: Some(0.5),
            },
            now,
            now,
        )
    }

    fn test_trade(symbol: &str) -> TradeEvent {
        TradeEvent::new(
            Symbol::new(symbol).unwrap(),
            Exchange::Binance,
            Some(1),
            Decimal::new(6505425, 2),
            Decimal::new(15, 2),
            fixed_now(),
            fixed_now(),
        )
        .unwrap()
    }

    fn default_public_data_mode_query() -> PublicDataModeQuery {
        PublicDataModeQuery::default()
    }

    fn live_public_data_mode_query() -> PublicDataModeQuery {
        PublicDataModeQuery {
            mode: Some(PublicDataMode::Live),
        }
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

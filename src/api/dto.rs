use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use uuid::Uuid;

use crate::{
    domain::{AnomalyEvent, MarketState, TradeEvent},
    runtime::RuntimeModeSnapshot,
    state,
    telemetry::InternalCountersSnapshot,
};

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub service: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SymbolsResponse {
    pub symbols: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct RuntimeModeResponse {
    pub mode: &'static str,
    pub mode_label: &'static str,
    pub status: &'static str,
    pub symbols: Vec<String>,
    pub switching_supported: bool,
    pub source: &'static str,
    pub last_started_at: DateTime<Utc>,
    pub last_switched_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RuntimeModeSwitchRequest {
    pub mode: String,
    pub symbols: Option<Vec<String>>,
    pub reset_state: Option<bool>,
    pub reset_storage: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineHealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

#[derive(Debug, Serialize)]
pub struct PipelineHealthResponse {
    pub status: PipelineHealthStatus,
    pub last_message_age_ms: Option<u64>,
    pub parse_errors: u64,
    pub reconnect_attempts: u64,
    pub storage_errors: u64,
    pub cache_errors: u64,
}

#[derive(Debug, Serialize)]
pub struct MarketStateResponse {
    pub symbol: String,
    pub last_trade_price: Option<Decimal>,
    pub last_trade_quantity: Option<Decimal>,
    pub best_bid_price: Option<Decimal>,
    pub best_bid_quantity: Option<Decimal>,
    pub best_ask_price: Option<Decimal>,
    pub best_ask_quantity: Option<Decimal>,
    pub top_bid_quantity: Option<Decimal>,
    pub top_ask_quantity: Option<Decimal>,
    pub top_bid_liquidity: Option<Decimal>,
    pub top_ask_liquidity: Option<Decimal>,
    pub book_imbalance: Option<Decimal>,
    pub depth_sequence_gap_count: u64,
    pub last_depth_event_time: Option<DateTime<Utc>>,
    pub last_depth_ingest_time: Option<DateTime<Utc>>,
    pub spread_pct: Option<f64>,
    pub price_change_1m_pct: Option<f64>,
    pub trades_per_minute: Option<f64>,
    pub last_event_time: Option<DateTime<Utc>>,
    pub last_ingest_time: Option<DateTime<Utc>>,
    pub last_event_age_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct AnomaliesResponse {
    pub anomalies: Vec<AnomalyResponse>,
}

#[derive(Debug, Serialize)]
pub struct AnomalyResponse {
    pub id: Uuid,
    pub symbol: String,
    pub anomaly_type: String,
    pub severity: String,
    pub message: String,
    pub observed_value: Option<f64>,
    pub threshold_value: Option<f64>,
    pub event_time: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct DashboardSummaryResponse {
    pub service: DashboardServiceSummary,
    pub pipeline: PipelineHealthResponse,
    pub symbols: Vec<DashboardSymbolSummary>,
    pub recent_anomalies: Vec<AnomalyResponse>,
}

#[derive(Debug, Serialize)]
pub struct MarketTimelineResponse {
    pub symbol: String,
    pub points: Vec<MarketTimelinePointResponse>,
    pub anomalies: Vec<AnomalyResponse>,
}

#[derive(Debug, Serialize)]
pub struct DashboardServiceSummary {
    pub status: &'static str,
    pub service: &'static str,
}

#[derive(Debug, Serialize)]
pub struct DashboardSymbolSummary {
    pub symbol: String,
    pub state: Option<DashboardStateSummary>,
    pub health: Option<DashboardHealthSummary>,
}

#[derive(Debug, Serialize)]
pub struct DashboardStateSummary {
    pub last_trade_price: Option<Decimal>,
    pub best_bid_price: Option<Decimal>,
    pub best_ask_price: Option<Decimal>,
    pub spread_pct: Option<f64>,
    pub price_change_1m_pct: Option<f64>,
    pub trades_per_minute: Option<f64>,
    pub last_event_time: Option<DateTime<Utc>>,
    pub last_event_age_ms: Option<u64>,
    pub depth_sequence_gap_count: u64,
}

#[derive(Debug, Serialize)]
pub struct DashboardHealthSummary {
    pub score: u8,
    pub status: crate::domain::HealthStatus,
    pub recent_anomaly_count: usize,
    pub evaluated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct MarketTimelinePointResponse {
    pub timestamp: DateTime<Utc>,
    pub price: Decimal,
    pub spread_pct: Option<f64>,
    pub trades_per_minute: Option<f64>,
    pub last_event_age_ms: Option<u64>,
}

impl MarketStateResponse {
    pub fn from_market_state(state: MarketState, now: DateTime<Utc>) -> Self {
        Self {
            symbol: state.symbol.as_str().to_owned(),
            last_trade_price: state.last_trade_price,
            last_trade_quantity: state.last_trade_quantity,
            best_bid_price: state.best_bid_price,
            best_bid_quantity: state.best_bid_quantity,
            best_ask_price: state.best_ask_price,
            best_ask_quantity: state.best_ask_quantity,
            top_bid_quantity: state.top_bid_quantity,
            top_ask_quantity: state.top_ask_quantity,
            top_bid_liquidity: state.top_bid_liquidity,
            top_ask_liquidity: state.top_ask_liquidity,
            book_imbalance: state.book_imbalance,
            depth_sequence_gap_count: state.depth_sequence_gap_count,
            last_depth_event_time: state.last_depth_event_time,
            last_depth_ingest_time: state.last_depth_ingest_time,
            spread_pct: state.signals.spread_pct,
            price_change_1m_pct: state.signals.price_change_1m_pct,
            trades_per_minute: state.signals.trades_per_minute,
            last_event_time: state.last_event_time,
            last_ingest_time: state.last_ingest_time,
            last_event_age_ms: state::last_event_age_ms(state.last_event_time, now),
        }
    }
}

impl RuntimeModeResponse {
    pub fn from_snapshot(snapshot: &RuntimeModeSnapshot) -> Self {
        Self {
            mode: snapshot.mode.as_str(),
            mode_label: snapshot.mode.label(),
            status: snapshot.status.as_str(),
            symbols: snapshot
                .symbols
                .iter()
                .map(|symbol| symbol.as_str().to_owned())
                .collect(),
            switching_supported: snapshot.switching_supported,
            source: snapshot.source.as_str(),
            last_started_at: snapshot.last_started_at,
            last_switched_at: snapshot.last_switched_at,
            last_error: snapshot.last_error.clone(),
        }
    }
}

impl DashboardStateSummary {
    pub fn from_market_state(state: &MarketState, now: DateTime<Utc>) -> Self {
        Self {
            last_trade_price: state.last_trade_price,
            best_bid_price: state.best_bid_price,
            best_ask_price: state.best_ask_price,
            spread_pct: state.signals.spread_pct,
            price_change_1m_pct: state.signals.price_change_1m_pct,
            trades_per_minute: state.signals.trades_per_minute,
            last_event_time: state.last_event_time,
            last_event_age_ms: state::last_event_age_ms(state.last_event_time, now),
            depth_sequence_gap_count: state.depth_sequence_gap_count,
        }
    }
}

impl MarketTimelinePointResponse {
    pub fn from_trade(trade: &TradeEvent, now: DateTime<Utc>) -> Self {
        Self {
            timestamp: trade.event_time,
            price: trade.price,
            spread_pct: None,
            trades_per_minute: None,
            last_event_age_ms: state::last_event_age_ms(Some(trade.event_time), now),
        }
    }
}

impl DashboardHealthSummary {
    pub fn from_evaluation(evaluation: crate::health::HealthEvaluation) -> Self {
        Self {
            score: evaluation.score,
            status: evaluation.status,
            recent_anomaly_count: evaluation.recent_anomaly_count,
            evaluated_at: evaluation.evaluated_at,
        }
    }
}

impl PipelineHealthResponse {
    pub fn from_snapshot(snapshot: &InternalCountersSnapshot) -> Self {
        Self {
            status: classify_pipeline_health(snapshot),
            last_message_age_ms: snapshot.last_message_age_ms,
            parse_errors: snapshot.parse_errors,
            reconnect_attempts: snapshot.reconnect_attempts,
            storage_errors: snapshot.storage_errors,
            cache_errors: snapshot.cache_errors,
        }
    }
}

impl AnomalyResponse {
    pub fn from_anomaly(anomaly: AnomalyEvent) -> Self {
        Self {
            id: anomaly.id,
            symbol: anomaly.symbol.as_str().to_owned(),
            anomaly_type: anomaly.anomaly_type.as_str().to_owned(),
            severity: anomaly.severity.as_str().to_owned(),
            message: anomaly.message,
            observed_value: anomaly.observed_value,
            threshold_value: anomaly.threshold_value,
            event_time: anomaly.event_time,
            created_at: anomaly.created_at,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MarketHealthResponse {
    pub symbol: String,
    pub score: u8,
    pub base_score: u8,
    pub status: crate::domain::HealthStatus,
    pub evaluated_at: DateTime<Utc>,
    pub recent_anomaly_count: usize,
    pub signals: crate::health::MarketHealthSignals,
    pub penalties: Vec<crate::health::HealthPenalty>,
}

impl MarketHealthResponse {
    pub fn from_evaluation(symbol: String, evaluation: crate::health::HealthEvaluation) -> Self {
        Self {
            symbol,
            score: evaluation.score,
            base_score: evaluation.base_score,
            status: evaluation.status,
            evaluated_at: evaluation.evaluated_at,
            recent_anomaly_count: evaluation.recent_anomaly_count,
            signals: evaluation.signals,
            penalties: evaluation.penalties,
        }
    }
}

const PIPELINE_DEGRADED_AFTER_MS: u64 = 5_000;
const PIPELINE_UNHEALTHY_AFTER_MS: u64 = 30_000;

fn classify_pipeline_health(snapshot: &InternalCountersSnapshot) -> PipelineHealthStatus {
    let has_concerning_errors =
        snapshot.parse_errors > 0 || snapshot.storage_errors > 0 || snapshot.cache_errors > 0;

    match snapshot.last_message_age_ms {
        Some(age_ms) if age_ms > PIPELINE_UNHEALTHY_AFTER_MS && has_concerning_errors => {
            PipelineHealthStatus::Unhealthy
        }
        Some(age_ms) if age_ms <= PIPELINE_DEGRADED_AFTER_MS && !has_concerning_errors => {
            PipelineHealthStatus::Healthy
        }
        _ => PipelineHealthStatus::Degraded,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;
    use uuid::Uuid;

    use super::{
        AnomalyResponse, MarketStateResponse, PipelineHealthResponse, PipelineHealthStatus,
    };
    use crate::domain::{
        AnomalyEvent, AnomalyMeasurement, AnomalyType, MarketState, Severity, Symbol,
    };
    use crate::telemetry::InternalCountersSnapshot;

    #[test]
    fn no_message_snapshot_is_degraded() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(None, 0, 0, 0, 0));

        assert_eq!(response.status, PipelineHealthStatus::Degraded);
        assert_eq!(response.last_message_age_ms, None);
    }

    #[test]
    fn recent_last_message_with_zero_concerning_errors_is_healthy() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(Some(1_000), 0, 2, 0, 0));

        assert_eq!(response.status, PipelineHealthStatus::Healthy);
    }

    #[test]
    fn old_last_message_is_degraded() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(Some(10_000), 0, 0, 0, 0));

        assert_eq!(response.status, PipelineHealthStatus::Degraded);
    }

    #[test]
    fn very_old_last_message_with_errors_is_unhealthy() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(Some(31_000), 1, 0, 0, 0));

        assert_eq!(response.status, PipelineHealthStatus::Unhealthy);
    }

    #[test]
    fn parse_errors_affect_status() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(Some(1_000), 1, 0, 0, 0));

        assert_eq!(response.status, PipelineHealthStatus::Degraded);
    }

    #[test]
    fn storage_errors_affect_status() {
        let response = PipelineHealthResponse::from_snapshot(&snapshot(Some(1_000), 0, 0, 1, 0));

        assert_eq!(response.status, PipelineHealthStatus::Degraded);
    }

    #[test]
    fn market_state_response_includes_depth_fields() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.top_bid_quantity = Some(Decimal::new(120, 2));
        state.top_ask_quantity = Some(Decimal::new(80, 2));
        state.top_bid_liquidity = Some(Decimal::new(7805760, 2));
        state.top_ask_liquidity = Some(Decimal::new(5204400, 2));
        state.book_imbalance = Some(Decimal::new(2, 1));
        state.depth_sequence_gap_count = 1;
        state.last_depth_event_time = Some(test_time());
        state.last_depth_ingest_time = Some(test_time());

        let response = MarketStateResponse::from_market_state(state, test_time());

        assert_eq!(response.top_bid_quantity, Some(Decimal::new(120, 2)));
        assert_eq!(response.top_ask_quantity, Some(Decimal::new(80, 2)));
        assert_eq!(response.top_bid_liquidity, Some(Decimal::new(7805760, 2)));
        assert_eq!(response.top_ask_liquidity, Some(Decimal::new(5204400, 2)));
        assert_eq!(response.book_imbalance, Some(Decimal::new(2, 1)));
        assert_eq!(response.depth_sequence_gap_count, 1);
        assert_eq!(response.last_depth_event_time, Some(test_time()));
        assert_eq!(response.last_depth_ingest_time, Some(test_time()));
    }

    #[test]
    fn trade_quote_only_market_state_response_has_empty_depth_fields() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_trade_price = Some(Decimal::new(6500010, 2));
        state.best_bid_price = Some(Decimal::new(6499910, 2));

        let response = MarketStateResponse::from_market_state(state, test_time());

        assert!(response.top_bid_quantity.is_none());
        assert!(response.top_ask_quantity.is_none());
        assert!(response.top_bid_liquidity.is_none());
        assert!(response.top_ask_liquidity.is_none());
        assert!(response.book_imbalance.is_none());
        assert_eq!(response.depth_sequence_gap_count, 0);
        assert!(response.last_depth_event_time.is_none());
        assert!(response.last_depth_ingest_time.is_none());
    }

    #[test]
    fn anomaly_response_supports_new_depth_related_type_strings() {
        let response = AnomalyResponse::from_anomaly(AnomalyEvent {
            id: Uuid::nil(),
            symbol: Symbol::new("BTCUSDT").unwrap(),
            anomaly_type: AnomalyType::DepthSequenceGap,
            severity: Severity::Warning,
            message: String::from("depth sequence gap count increased by 1 to 1"),
            observed_value: AnomalyMeasurement {
                observed_value: Some(1.0),
                threshold_value: Some(1.0),
            }
            .observed_value,
            threshold_value: AnomalyMeasurement {
                observed_value: Some(1.0),
                threshold_value: Some(1.0),
            }
            .threshold_value,
            event_time: test_time(),
            created_at: test_time(),
        });

        assert_eq!(response.anomaly_type, "depth_sequence_gap");
        assert_eq!(response.severity, "warning");
    }

    fn snapshot(
        last_message_age_ms: Option<u64>,
        parse_errors: u64,
        reconnect_attempts: u64,
        storage_errors: u64,
        cache_errors: u64,
    ) -> InternalCountersSnapshot {
        InternalCountersSnapshot {
            parse_errors,
            replay_parse_errors: 0,
            binance_parse_errors: 0,
            reconnect_attempts,
            binance_reconnect_attempts: 0,
            storage_errors,
            cache_errors,
            replay_trade_events: 0,
            replay_quote_events: 0,
            replay_depth_events: 0,
            binance_trade_events: 0,
            binance_quote_events: 0,
            binance_depth_events: 0,
            last_message_unix_ms: None,
            last_message_age_ms,
        }
    }

    fn test_time() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }
}

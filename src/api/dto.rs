use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use uuid::Uuid;

use crate::{
    domain::{AnomalyEvent, MarketState},
    state,
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
pub struct MarketStateResponse {
    pub symbol: String,
    pub last_trade_price: Option<Decimal>,
    pub last_trade_quantity: Option<Decimal>,
    pub best_bid_price: Option<Decimal>,
    pub best_bid_quantity: Option<Decimal>,
    pub best_ask_price: Option<Decimal>,
    pub best_ask_quantity: Option<Decimal>,
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
            spread_pct: state.signals.spread_pct,
            price_change_1m_pct: state.signals.price_change_1m_pct,
            trades_per_minute: state.signals.trades_per_minute,
            last_event_time: state.last_event_time,
            last_ingest_time: state.last_ingest_time,
            last_event_age_ms: state::last_event_age_ms(state.last_event_time, now),
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

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{Severity, Symbol};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnomalyType {
    PriceMove,
    SpreadSpike,
    StaleData,
    TradeBurst,
    QuoteStuck,
    EventLagSpike,
    DepthSequenceGap,
}

impl AnomalyType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PriceMove => "price_move",
            Self::SpreadSpike => "spread_spike",
            Self::StaleData => "stale_data",
            Self::TradeBurst => "trade_burst",
            Self::QuoteStuck => "quote_stuck",
            Self::EventLagSpike => "event_lag_spike",
            Self::DepthSequenceGap => "depth_sequence_gap",
        }
    }

    pub fn parse(value: &str) -> anyhow::Result<Self> {
        match value {
            "price_move" => Ok(Self::PriceMove),
            "spread_spike" => Ok(Self::SpreadSpike),
            "stale_data" => Ok(Self::StaleData),
            "trade_burst" => Ok(Self::TradeBurst),
            "quote_stuck" => Ok(Self::QuoteStuck),
            "event_lag_spike" => Ok(Self::EventLagSpike),
            "depth_sequence_gap" => Ok(Self::DepthSequenceGap),
            _ => anyhow::bail!("unsupported anomaly type value: {value}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AnomalyEvent {
    pub id: Uuid,
    pub symbol: Symbol,
    pub anomaly_type: AnomalyType,
    pub severity: Severity,
    pub message: String,
    pub observed_value: Option<f64>,
    pub threshold_value: Option<f64>,
    pub event_time: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct AnomalyMeasurement {
    pub observed_value: Option<f64>,
    pub threshold_value: Option<f64>,
}

impl AnomalyEvent {
    pub fn new(
        symbol: Symbol,
        anomaly_type: AnomalyType,
        severity: Severity,
        message: impl Into<String>,
        measurement: AnomalyMeasurement,
        event_time: DateTime<Utc>,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            symbol,
            anomaly_type,
            severity,
            message: message.into(),
            observed_value: measurement.observed_value,
            threshold_value: measurement.threshold_value,
            event_time,
            created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::{AnomalyEvent, AnomalyMeasurement, AnomalyType};
    use crate::domain::{Severity, Symbol};

    #[test]
    fn anomaly_event_assigns_an_id() {
        let anomaly = AnomalyEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            AnomalyType::SpreadSpike,
            Severity::Warning,
            "spread widened beyond baseline",
            AnomalyMeasurement {
                observed_value: Some(0.9),
                threshold_value: Some(0.5),
            },
            Utc::now(),
            Utc::now(),
        );

        assert_ne!(anomaly.id, uuid::Uuid::nil());
    }

    #[test]
    fn new_depth_related_anomaly_types_parse_and_render() {
        assert_eq!(AnomalyType::QuoteStuck.as_str(), "quote_stuck");
        assert_eq!(AnomalyType::EventLagSpike.as_str(), "event_lag_spike");
        assert_eq!(AnomalyType::DepthSequenceGap.as_str(), "depth_sequence_gap");
        assert_eq!(
            AnomalyType::parse("quote_stuck").unwrap(),
            AnomalyType::QuoteStuck
        );
        assert_eq!(
            AnomalyType::parse("event_lag_spike").unwrap(),
            AnomalyType::EventLagSpike
        );
        assert_eq!(
            AnomalyType::parse("depth_sequence_gap").unwrap(),
            AnomalyType::DepthSequenceGap
        );
    }
}

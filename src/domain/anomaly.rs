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
}

impl AnomalyType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PriceMove => "price_move",
            Self::SpreadSpike => "spread_spike",
            Self::StaleData => "stale_data",
            Self::TradeBurst => "trade_burst",
        }
    }

    pub fn parse(value: &str) -> anyhow::Result<Self> {
        match value {
            "price_move" => Ok(Self::PriceMove),
            "spread_spike" => Ok(Self::SpreadSpike),
            "stale_data" => Ok(Self::StaleData),
            "trade_burst" => Ok(Self::TradeBurst),
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
}

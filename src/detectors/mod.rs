mod depth_sequence_gap;
mod engine;
mod event_lag_spike;
mod price_move;
mod quote_stuck;
mod spread_spike;
mod stale_data;
#[cfg(test)]
pub(crate) mod test_support;
mod trade_burst;

use engine::DetectionContext;

use crate::domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity};

pub use engine::DetectorEngine;

fn anomaly_from_context(
    context: &DetectionContext<'_>,
    anomaly_type: AnomalyType,
    severity: Severity,
    message: String,
    observed_value: Option<f64>,
    threshold_value: Option<f64>,
) -> AnomalyEvent {
    AnomalyEvent::new(
        context.state.symbol.clone(),
        anomaly_type,
        severity,
        message,
        AnomalyMeasurement {
            observed_value,
            threshold_value,
        },
        context.event_time,
        context.now,
    )
}

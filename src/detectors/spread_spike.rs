use rust_decimal::prelude::ToPrimitive;

use crate::{
    detectors::{anomaly_from_context, engine::DetectionContext},
    domain::{AnomalyEvent, AnomalyType, Severity},
};

pub fn detect(context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
    let spread_pct = context.state.signals.spread_pct?;
    let threshold = context
        .settings
        .spread_spike_pct_threshold
        .to_f64()
        .unwrap_or_default();

    if spread_pct < threshold {
        return None;
    }

    Some(anomaly_from_context(
        context,
        AnomalyType::SpreadSpike,
        Severity::Warning,
        format!(
            "spread widened to {:.4}% beyond the configured {:.4}% threshold",
            spread_pct, threshold
        ),
        Some(spread_pct),
        Some(threshold),
    ))
}

#[cfg(test)]
mod tests {
    use super::detect;
    use crate::{
        detectors::test_support::{
            base_signals, context, default_detector_settings, market_state_with_signals,
        },
        domain::MarketState,
    };

    #[test]
    fn spread_spike_emits_when_threshold_exceeded() {
        let state = state_with_spread(Some(0.75));
        let settings = default_detector_settings();
        let anomaly = detect(&context(&state, &settings)).unwrap();

        assert_eq!(
            anomaly.anomaly_type,
            crate::domain::AnomalyType::SpreadSpike
        );
        assert_eq!(anomaly.severity, crate::domain::Severity::Warning);
        assert_eq!(anomaly.observed_value, Some(0.75));
        assert_eq!(anomaly.threshold_value, Some(0.5));
    }

    #[test]
    fn spread_spike_does_not_emit_when_below_threshold_or_missing() {
        let below = state_with_spread(Some(0.25));
        let missing = state_with_spread(None);
        let settings = default_detector_settings();

        assert!(detect(&context(&below, &settings)).is_none());
        assert!(detect(&context(&missing, &settings)).is_none());
    }

    fn state_with_spread(spread_pct: Option<f64>) -> MarketState {
        let mut signals = base_signals();
        signals.spread_pct = spread_pct;
        market_state_with_signals(signals)
    }
}

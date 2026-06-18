use crate::{
    detectors::{anomaly_from_context, engine::DetectionContext},
    domain::{AnomalyEvent, AnomalyType, Severity},
};
use rust_decimal::prelude::ToPrimitive;

pub fn detect(context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
    let change_pct = context.state.signals.price_change_1m_pct?;
    let threshold = context
        .settings
        .price_move_1m_pct_threshold
        .to_f64()
        .unwrap_or_default();

    if change_pct.abs() < threshold {
        return None;
    }

    let severity = if change_pct.abs() >= threshold * 2.0 {
        Severity::Critical
    } else {
        Severity::Warning
    };

    Some(anomaly_from_context(
        context,
        AnomalyType::PriceMove,
        severity,
        format!(
            "price moved {:.4}% over the last minute, exceeding the configured {:.4}% threshold",
            change_pct, threshold
        ),
        Some(change_pct),
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
    fn price_move_emits_when_threshold_exceeded() {
        let state = state_with_signals(Some(3.0), None);
        let settings = default_detector_settings();
        let anomaly = detect(&context(&state, &settings)).unwrap();

        assert_eq!(anomaly.anomaly_type, crate::domain::AnomalyType::PriceMove);
        assert_eq!(anomaly.severity, crate::domain::Severity::Warning);
        assert_eq!(anomaly.observed_value, Some(3.0));
        assert_eq!(anomaly.threshold_value, Some(2.5));
    }

    #[test]
    fn price_move_does_not_emit_below_threshold_or_without_signal() {
        let below = state_with_signals(Some(2.0), None);
        let missing = state_with_signals(None, None);
        let settings = default_detector_settings();

        assert!(detect(&context(&below, &settings)).is_none());
        assert!(detect(&context(&missing, &settings)).is_none());
    }

    fn state_with_signals(
        price_change_1m_pct: Option<f64>,
        spread_pct: Option<f64>,
    ) -> MarketState {
        let mut signals = base_signals();
        signals.price_change_1m_pct = price_change_1m_pct;
        signals.spread_pct = spread_pct;
        market_state_with_signals(signals)
    }
}

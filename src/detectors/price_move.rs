use crate::{
    detectors::engine::DetectionContext,
    domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity},
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

    Some(AnomalyEvent::new(
        context.state.symbol.clone(),
        AnomalyType::PriceMove,
        severity,
        format!(
            "price moved {:.4}% over the last minute, exceeding the configured {:.4}% threshold",
            change_pct, threshold
        ),
        AnomalyMeasurement {
            observed_value: Some(change_pct),
            threshold_value: Some(threshold),
        },
        context.event_time,
        context.now,
    ))
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::detect;
    use crate::{
        config::DetectorSettings,
        detectors::engine::DetectionContext,
        domain::{MarketSignals, MarketState, Symbol},
    };

    #[test]
    fn price_move_emits_when_threshold_exceeded() {
        let state = state_with_signals(Some(3.0), None);
        let settings = settings();
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
        let settings = settings();

        assert!(detect(&context(&below, &settings)).is_none());
        assert!(detect(&context(&missing, &settings)).is_none());
    }

    fn settings() -> DetectorSettings {
        DetectorSettings {
            price_move_1m_pct_threshold: Decimal::new(25, 1),
            spread_spike_pct_threshold: Decimal::new(5, 1),
            stale_data_ms_threshold: 5_000,
            trade_burst_multiplier: Decimal::new(3, 0),
            trade_burst_min_warmup_windows: 5,
        }
    }

    fn context<'a>(state: &'a MarketState, settings: &'a DetectorSettings) -> DetectionContext<'a> {
        DetectionContext {
            state,
            settings,
            now: Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 0).unwrap(),
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap(),
        }
    }

    fn state_with_signals(
        price_change_1m_pct: Option<f64>,
        spread_pct: Option<f64>,
    ) -> MarketState {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.signals = MarketSignals {
            spread_pct,
            price_change_1m_pct,
            trades_per_minute: None,
        };
        state
    }
}

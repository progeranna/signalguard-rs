use rust_decimal::prelude::ToPrimitive;

use crate::{
    detectors::engine::DetectionContext,
    domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity},
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

    Some(AnomalyEvent::new(
        context.state.symbol.clone(),
        AnomalyType::SpreadSpike,
        Severity::Warning,
        format!(
            "spread widened to {:.4}% beyond the configured {:.4}% threshold",
            spread_pct, threshold
        ),
        AnomalyMeasurement {
            observed_value: Some(spread_pct),
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
    fn spread_spike_emits_when_threshold_exceeded() {
        let state = state_with_spread(Some(0.75));
        let settings = settings();
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
            quote_stuck_ms_threshold: 10_000,
            event_lag_spike_ms_threshold: 3_000,
            depth_sequence_gap_min_increment: 1,
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

    fn state_with_spread(spread_pct: Option<f64>) -> MarketState {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.signals = MarketSignals {
            spread_pct,
            price_change_1m_pct: None,
            trades_per_minute: None,
        };
        state
    }
}

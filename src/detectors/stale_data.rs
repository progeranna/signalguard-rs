use crate::{
    detectors::engine::DetectionContext,
    domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity},
};

pub fn detect(context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
    let last_event_time = context.state.last_event_time?;
    let age_ms = context
        .now
        .signed_duration_since(last_event_time)
        .num_milliseconds()
        .max(0) as u64;
    let threshold = context.settings.stale_data_ms_threshold;

    if age_ms < threshold {
        return None;
    }

    let severity = if age_ms >= threshold.saturating_mul(2) {
        Severity::Critical
    } else {
        Severity::Warning
    };

    Some(AnomalyEvent::new(
        context.state.symbol.clone(),
        AnomalyType::StaleData,
        severity,
        format!(
            "market data age is {} ms, exceeding the configured {} ms threshold",
            age_ms, threshold
        ),
        AnomalyMeasurement {
            observed_value: Some(age_ms as f64),
            threshold_value: Some(threshold as f64),
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
        domain::{MarketState, Symbol},
    };

    #[test]
    fn stale_data_emits_when_too_old() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_event_time = Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap());
        let settings = settings();
        let anomaly = detect(&context(&state, &settings, 10)).unwrap();

        assert_eq!(anomaly.anomaly_type, crate::domain::AnomalyType::StaleData);
        assert_eq!(anomaly.severity, crate::domain::Severity::Critical);
        assert_eq!(anomaly.observed_value, Some(10_000.0));
    }

    #[test]
    fn stale_data_does_not_emit_when_fresh() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_event_time = Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap());
        let settings = settings();

        assert!(detect(&context(&state, &settings, 4)).is_none());
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

    fn context<'a>(
        state: &'a MarketState,
        settings: &'a DetectorSettings,
        age_seconds: i64,
    ) -> DetectionContext<'a> {
        DetectionContext {
            state,
            settings,
            now: state.last_event_time.unwrap() + chrono::Duration::seconds(age_seconds),
            event_time: state.last_event_time.unwrap(),
        }
    }
}

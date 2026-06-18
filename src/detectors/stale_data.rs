use crate::{
    detectors::{anomaly_from_context, engine::DetectionContext},
    domain::{AnomalyEvent, AnomalyType, Severity},
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

    Some(anomaly_from_context(
        context,
        AnomalyType::StaleData,
        severity,
        format!(
            "market data age is {} ms, exceeding the configured {} ms threshold",
            age_ms, threshold
        ),
        Some(age_ms as f64),
        Some(threshold as f64),
    ))
}

#[cfg(test)]
mod tests {
    use chrono::Duration;

    use super::detect;
    use crate::{
        config::DetectorSettings,
        detectors::engine::DetectionContext,
        detectors::test_support::{btc_market_state, default_detector_settings, test_time},
        domain::MarketState,
    };

    #[test]
    fn stale_data_emits_when_too_old() {
        let mut state = btc_market_state();
        state.last_event_time = Some(test_time(0));
        let settings = default_detector_settings();
        let anomaly = detect(&context(&state, &settings, 10)).unwrap();

        assert_eq!(anomaly.anomaly_type, crate::domain::AnomalyType::StaleData);
        assert_eq!(anomaly.severity, crate::domain::Severity::Critical);
        assert_eq!(anomaly.observed_value, Some(10_000.0));
    }

    #[test]
    fn stale_data_does_not_emit_when_fresh() {
        let mut state = btc_market_state();
        state.last_event_time = Some(test_time(0));
        let settings = default_detector_settings();

        assert!(detect(&context(&state, &settings, 4)).is_none());
    }

    fn context<'a>(
        state: &'a MarketState,
        settings: &'a DetectorSettings,
        age_seconds: i64,
    ) -> DetectionContext<'a> {
        DetectionContext {
            state,
            settings,
            now: state.last_event_time.unwrap() + Duration::seconds(age_seconds),
            event_time: state.last_event_time.unwrap(),
        }
    }
}

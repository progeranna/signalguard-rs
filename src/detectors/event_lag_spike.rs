use crate::{
    detectors::{anomaly_from_context, engine::DetectionContext},
    domain::{AnomalyEvent, AnomalyType, Severity},
};

pub fn detect(context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
    let last_event_time = context.state.last_event_time?;
    let last_ingest_time = context.state.last_ingest_time?;
    let lag_ms = last_ingest_time
        .signed_duration_since(last_event_time)
        .num_milliseconds()
        .max(0) as u64;
    let threshold = context.settings.event_lag_spike_ms_threshold;

    if lag_ms < threshold {
        return None;
    }

    let severity = if lag_ms >= threshold.saturating_mul(2) {
        Severity::Critical
    } else {
        Severity::Warning
    };

    Some(anomaly_from_context(
        context,
        AnomalyType::EventLagSpike,
        severity,
        format!(
            "event lag reached {} ms between event_time and ingest_time, exceeding the configured {} ms threshold",
            lag_ms, threshold
        ),
        Some(lag_ms as f64),
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
    fn event_lag_spike_emits_above_threshold() {
        let state = state_with_times(Some(0), Some(4));
        let settings = default_detector_settings();
        let anomaly = detect(&context(&state, &settings)).unwrap();

        assert_eq!(
            anomaly.anomaly_type,
            crate::domain::AnomalyType::EventLagSpike
        );
        assert_eq!(anomaly.severity, crate::domain::Severity::Warning);
        assert_eq!(anomaly.observed_value, Some(4_000.0));
        assert_eq!(anomaly.threshold_value, Some(3_000.0));
        assert!(anomaly.message.contains("event lag reached 4000 ms"));
    }

    #[test]
    fn event_lag_spike_does_not_emit_below_threshold() {
        let state = state_with_times(Some(0), Some(2));
        let settings = default_detector_settings();

        assert!(detect(&context(&state, &settings)).is_none());
    }

    #[test]
    fn event_lag_spike_does_not_emit_when_times_are_missing() {
        let settings = default_detector_settings();
        let missing_event = state_with_times(None, Some(4));
        let missing_ingest = state_with_times(Some(0), None);

        assert!(detect(&context(&missing_event, &settings)).is_none());
        assert!(detect(&context(&missing_ingest, &settings)).is_none());
    }

    #[test]
    fn event_lag_spike_ignores_negative_lag() {
        let state = state_with_event_and_ingest(5, 4);
        let settings = default_detector_settings();

        assert!(detect(&context(&state, &settings)).is_none());
    }

    fn context<'a>(state: &'a MarketState, settings: &'a DetectorSettings) -> DetectionContext<'a> {
        DetectionContext {
            state,
            settings,
            now: test_time(60),
            event_time: state.last_event_time.unwrap_or_else(|| test_time(0)),
        }
    }

    fn state_with_times(
        event_offset_seconds: Option<i64>,
        ingest_offset_seconds: Option<i64>,
    ) -> MarketState {
        let base = test_time(0);
        let mut state = btc_market_state();
        state.last_event_time =
            event_offset_seconds.map(|seconds| base + Duration::seconds(seconds));
        state.last_ingest_time =
            ingest_offset_seconds.map(|seconds| base + Duration::seconds(seconds));
        state
    }

    fn state_with_event_and_ingest(
        event_offset_seconds: i64,
        ingest_offset_seconds: i64,
    ) -> MarketState {
        state_with_times(Some(event_offset_seconds), Some(ingest_offset_seconds))
    }
}

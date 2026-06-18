use crate::{
    detectors::engine::DetectionContext,
    domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity},
};

#[derive(Clone, Copy, Debug, Default)]
pub struct DepthSequenceGapState {
    last_seen_gap_count: Option<u64>,
}

impl DepthSequenceGapState {
    pub fn evaluate(&mut self, context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
        let current_count = context.state.depth_sequence_gap_count;
        let previous_count = self.last_seen_gap_count.replace(current_count).unwrap_or(0);

        if current_count == 0 || current_count <= previous_count {
            return None;
        }

        let increment = current_count - previous_count;
        let threshold = context.settings.depth_sequence_gap_min_increment;
        if increment < threshold {
            return None;
        }

        Some(AnomalyEvent::new(
            context.state.symbol.clone(),
            AnomalyType::DepthSequenceGap,
            Severity::Warning,
            format!(
                "depth sequence gap count increased by {} to {}",
                increment, current_count
            ),
            AnomalyMeasurement {
                observed_value: Some(increment as f64),
                threshold_value: Some(threshold as f64),
            },
            context
                .state
                .last_depth_event_time
                .unwrap_or(context.event_time),
            context.now,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::DepthSequenceGapState;
    use crate::{
        config::DetectorSettings,
        detectors::{
            engine::DetectionContext,
            test_support::{btc_market_state, context_at, default_detector_settings, test_time},
        },
        domain::MarketState,
    };

    #[test]
    fn depth_sequence_gap_emits_on_first_observed_gap_count() {
        let mut detector = DepthSequenceGapState::default();
        let state = state_with_gap_count(1);
        let settings = default_detector_settings();
        let anomaly = detector.evaluate(&context(&state, &settings)).unwrap();

        assert_eq!(
            anomaly.anomaly_type,
            crate::domain::AnomalyType::DepthSequenceGap
        );
        assert_eq!(anomaly.severity, crate::domain::Severity::Warning);
        assert_eq!(anomaly.observed_value, Some(1.0));
        assert_eq!(anomaly.threshold_value, Some(1.0));
    }

    #[test]
    fn depth_sequence_gap_emits_when_gap_count_increases() {
        let mut detector = DepthSequenceGapState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_gap_count(1), &settings))
                .is_some()
        );
        let anomaly = detector
            .evaluate(&context(&state_with_gap_count(3), &settings))
            .unwrap();

        assert_eq!(anomaly.observed_value, Some(2.0));
    }

    #[test]
    fn depth_sequence_gap_does_not_emit_when_count_is_unchanged() {
        let mut detector = DepthSequenceGapState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_gap_count(1), &settings))
                .is_some()
        );
        assert!(
            detector
                .evaluate(&context(&state_with_gap_count(1), &settings))
                .is_none()
        );
    }

    #[test]
    fn depth_sequence_gap_does_not_emit_when_count_decreases() {
        let mut detector = DepthSequenceGapState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_gap_count(2), &settings))
                .is_some()
        );
        assert!(
            detector
                .evaluate(&context(&state_with_gap_count(1), &settings))
                .is_none()
        );
    }

    fn context<'a>(state: &'a MarketState, settings: &'a DetectorSettings) -> DetectionContext<'a> {
        context_at(
            state,
            settings,
            test_time(60),
            state.last_event_time.unwrap_or_else(|| test_time(0)),
        )
    }

    fn state_with_gap_count(depth_sequence_gap_count: u64) -> MarketState {
        let mut state = btc_market_state();
        let event_time = test_time(30);
        state.depth_sequence_gap_count = depth_sequence_gap_count;
        state.last_event_time = Some(event_time);
        state.last_depth_event_time = Some(event_time);
        state
    }
}

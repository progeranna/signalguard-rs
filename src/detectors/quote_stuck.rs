use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use crate::{
    detectors::{anomaly_from_context, engine::DetectionContext},
    domain::{AnomalyEvent, AnomalyType, MarketState, Severity},
};

#[derive(Clone, Debug, Default)]
pub struct QuoteStuckState {
    last_signature: Option<TopOfBookSignature>,
    last_changed_at: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct TopOfBookSignature {
    best_bid_price: Decimal,
    best_bid_quantity: Decimal,
    best_ask_price: Decimal,
    best_ask_quantity: Decimal,
    top_bid_quantity: Option<Decimal>,
    top_ask_quantity: Option<Decimal>,
}

impl QuoteStuckState {
    pub fn evaluate(&mut self, context: &DetectionContext<'_>) -> Option<AnomalyEvent> {
        let signature = match TopOfBookSignature::from_state(context.state) {
            Some(signature) => signature,
            None => {
                self.last_signature = None;
                self.last_changed_at = None;
                return None;
            }
        };

        if self.last_signature.as_ref() != Some(&signature) {
            self.last_signature = Some(signature);
            self.last_changed_at = Some(context.event_time);
            return None;
        }

        let last_changed_at = self.last_changed_at.unwrap_or(context.event_time);
        let stuck_ms = context
            .event_time
            .signed_duration_since(last_changed_at)
            .num_milliseconds()
            .max(0) as u64;
        let threshold = context.settings.quote_stuck_ms_threshold;
        if stuck_ms < threshold {
            return None;
        }

        let severity = if stuck_ms >= threshold.saturating_mul(2) {
            Severity::Critical
        } else {
            Severity::Warning
        };

        Some(anomaly_from_context(
            context,
            AnomalyType::QuoteStuck,
            severity,
            format!(
                "top-of-book signature stayed unchanged for {} ms, exceeding the configured {} ms threshold",
                stuck_ms, threshold
            ),
            Some(stuck_ms as f64),
            Some(threshold as f64),
        ))
    }
}

impl TopOfBookSignature {
    fn from_state(state: &MarketState) -> Option<Self> {
        Some(Self {
            best_bid_price: state.best_bid_price?,
            best_bid_quantity: state.best_bid_quantity?,
            best_ask_price: state.best_ask_price?,
            best_ask_quantity: state.best_ask_quantity?,
            top_bid_quantity: state.top_bid_quantity,
            top_ask_quantity: state.top_ask_quantity,
        })
    }
}

#[cfg(test)]
mod tests {
    use chrono::Duration;
    use rust_decimal::Decimal;

    use super::QuoteStuckState;
    use crate::{
        config::DetectorSettings,
        detectors::engine::DetectionContext,
        detectors::test_support::{
            btc_market_state, context_at, default_detector_settings, test_time,
        },
        domain::MarketState,
    };

    #[test]
    fn quote_stuck_emits_after_unchanged_signature_exceeds_threshold() {
        let mut detector = QuoteStuckState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_signature(0, 2, 1), &settings))
                .is_none()
        );
        let anomaly = detector
            .evaluate(&context(&state_with_signature(11, 2, 1), &settings))
            .unwrap();

        assert_eq!(anomaly.anomaly_type, crate::domain::AnomalyType::QuoteStuck);
        assert_eq!(anomaly.observed_value, Some(11_000.0));
        assert_eq!(anomaly.threshold_value, Some(10_000.0));
    }

    #[test]
    fn quote_stuck_does_not_emit_before_threshold() {
        let mut detector = QuoteStuckState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_signature(0, 2, 1), &settings))
                .is_none()
        );
        assert!(
            detector
                .evaluate(&context(&state_with_signature(9, 2, 1), &settings))
                .is_none()
        );
    }

    #[test]
    fn quote_stuck_resets_when_top_of_book_changes() {
        let mut detector = QuoteStuckState::default();
        let settings = default_detector_settings();

        assert!(
            detector
                .evaluate(&context(&state_with_signature(0, 2, 1), &settings))
                .is_none()
        );
        assert!(
            detector
                .evaluate(&context(&state_with_signature(11, 2, 2), &settings))
                .is_none()
        );
        assert!(
            detector
                .evaluate(&context(&state_with_signature(20, 2, 2), &settings))
                .is_none()
        );
    }

    #[test]
    fn quote_stuck_does_not_emit_with_missing_top_of_book_fields() {
        let mut detector = QuoteStuckState::default();
        let settings = default_detector_settings();
        let mut missing = state_with_signature(0, 2, 1);
        missing.best_bid_price = None;

        assert!(detector.evaluate(&context(&missing, &settings)).is_none());
    }

    fn context<'a>(state: &'a MarketState, settings: &'a DetectorSettings) -> DetectionContext<'a> {
        context_at(
            state,
            settings,
            test_time(60),
            state.last_event_time.unwrap_or_else(|| test_time(0)),
        )
    }

    fn state_with_signature(
        event_offset_seconds: i64,
        top_bid_quantity_units: i64,
        top_ask_quantity_units: i64,
    ) -> MarketState {
        let base = test_time(0);
        let mut state = btc_market_state();
        state.best_bid_price = Some(Decimal::new(6500000, 2));
        state.best_bid_quantity = Some(Decimal::new(125, 2));
        state.best_ask_price = Some(Decimal::new(6500100, 2));
        state.best_ask_quantity = Some(Decimal::new(150, 2));
        state.top_bid_quantity = Some(Decimal::new(top_bid_quantity_units, 0));
        state.top_ask_quantity = Some(Decimal::new(top_ask_quantity_units, 0));
        state.last_event_time = Some(base + Duration::seconds(event_offset_seconds));
        state
    }
}

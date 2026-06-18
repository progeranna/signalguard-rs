use std::{collections::HashMap, time::Duration};

use chrono::{DateTime, Utc};
use tracing::info;

use crate::{
    config::DetectorSettings,
    domain::{AnomalyEvent, AnomalyType, MarketState, Symbol},
};

use super::{
    depth_sequence_gap::DepthSequenceGapState, event_lag_spike, price_move,
    quote_stuck::QuoteStuckState, spread_spike, stale_data, trade_burst::TradeBurstState,
};

const DETECTOR_COOLDOWN: Duration = Duration::from_secs(30);

pub struct DetectionContext<'a> {
    pub state: &'a MarketState,
    pub settings: &'a DetectorSettings,
    pub now: DateTime<Utc>,
    pub event_time: DateTime<Utc>,
}

#[derive(Default)]
pub struct DetectorEngine {
    trade_burst_state: HashMap<Symbol, TradeBurstState>,
    quote_stuck_state: HashMap<Symbol, QuoteStuckState>,
    depth_sequence_gap_state: HashMap<Symbol, DepthSequenceGapState>,
    last_emitted: HashMap<(Symbol, AnomalyType), DateTime<Utc>>,
}

impl DetectorEngine {
    pub fn evaluate(
        &mut self,
        state: &MarketState,
        settings: &DetectorSettings,
        now: DateTime<Utc>,
    ) -> Vec<AnomalyEvent> {
        let event_time = state.last_event_time.unwrap_or(now);
        let context = DetectionContext {
            state,
            settings,
            now,
            event_time,
        };
        let mut anomalies = Vec::new();

        anomalies.extend(price_move::detect(&context));
        anomalies.extend(spread_spike::detect(&context));
        anomalies.extend(stale_data::detect(&context));
        anomalies.extend(event_lag_spike::detect(&context));

        let trade_burst_state = self
            .trade_burst_state
            .entry(state.symbol.clone())
            .or_default();
        anomalies.extend(trade_burst_state.evaluate(&state.symbol, &context));
        let quote_stuck_state = self
            .quote_stuck_state
            .entry(state.symbol.clone())
            .or_default();
        anomalies.extend(quote_stuck_state.evaluate(&context));
        let depth_sequence_gap_state = self
            .depth_sequence_gap_state
            .entry(state.symbol.clone())
            .or_default();
        anomalies.extend(depth_sequence_gap_state.evaluate(&context));

        anomalies
            .into_iter()
            .filter(|anomaly| self.should_emit(anomaly))
            .collect()
    }

    fn should_emit(&mut self, anomaly: &AnomalyEvent) -> bool {
        let key = (anomaly.symbol.clone(), anomaly.anomaly_type);

        if let Some(previous) = self.last_emitted.get(&key) {
            let elapsed = anomaly
                .created_at
                .signed_duration_since(*previous)
                .num_seconds()
                .max(0) as u64;
            if elapsed < DETECTOR_COOLDOWN.as_secs() {
                return false;
            }
        }

        info!(
            symbol = %anomaly.symbol,
            anomaly_type = %anomaly.anomaly_type.as_str(),
            severity = %anomaly.severity.as_str(),
            "detector emitted anomaly"
        );
        self.last_emitted.insert(key, anomaly.created_at);
        true
    }
}

#[cfg(test)]
mod tests {
    use chrono::{DateTime, Utc};
    use rust_decimal::Decimal;

    use super::DetectorEngine;
    use crate::{
        detectors::test_support::{base_signals, default_detector_settings, symbol, test_time},
        domain::MarketState,
    };

    #[test]
    fn detector_engine_tracks_symbols_independently() {
        let mut engine = DetectorEngine::default();
        let settings = default_detector_settings();
        let btc_state = state_with("BTCUSDT", Some(3.0), None, Some(1.0), test_time(0));
        let eth_state = state_with("ETHUSDT", Some(3.0), None, Some(1.0), test_time(1));

        let btc = engine.evaluate(&btc_state, &settings, test_time(10));
        let eth = engine.evaluate(&eth_state, &settings, test_time(10));

        assert_eq!(btc.len(), 2);
        assert_eq!(eth.len(), 2);
    }

    #[test]
    fn quote_stuck_state_is_independent_per_symbol() {
        let mut engine = DetectorEngine::default();
        let settings = default_detector_settings();

        let btc_first = top_of_book_state("BTCUSDT", test_time(0), Decimal::new(2, 0));
        let eth_first = top_of_book_state("ETHUSDT", test_time(0), Decimal::new(2, 0));
        let btc_second = top_of_book_state("BTCUSDT", test_time(11), Decimal::new(2, 0));
        let eth_changed = top_of_book_state("ETHUSDT", test_time(11), Decimal::new(3, 0));

        assert!(
            engine
                .evaluate(&btc_first, &settings, test_time(0))
                .is_empty()
        );
        assert!(
            engine
                .evaluate(&eth_first, &settings, test_time(0))
                .is_empty()
        );

        let btc_anomalies = engine.evaluate(&btc_second, &settings, test_time(11));
        let eth_anomalies = engine.evaluate(&eth_changed, &settings, test_time(11));

        assert!(
            btc_anomalies
                .iter()
                .any(|anomaly| anomaly.anomaly_type == crate::domain::AnomalyType::QuoteStuck)
        );
        assert!(
            eth_anomalies
                .iter()
                .all(|anomaly| anomaly.anomaly_type != crate::domain::AnomalyType::QuoteStuck)
        );
    }

    #[test]
    fn depth_sequence_gap_state_is_independent_per_symbol() {
        let mut engine = DetectorEngine::default();
        let settings = default_detector_settings();

        let btc_gap = depth_gap_state("BTCUSDT", 1);
        let eth_gap = depth_gap_state("ETHUSDT", 0);

        let btc_anomalies = engine.evaluate(&btc_gap, &settings, test_time(10));
        let eth_anomalies = engine.evaluate(&eth_gap, &settings, test_time(10));

        assert!(btc_anomalies.iter().any(|anomaly| anomaly.anomaly_type
            == crate::domain::AnomalyType::DepthSequenceGap));
        assert!(eth_anomalies
            .iter()
            .all(|anomaly| anomaly.anomaly_type != crate::domain::AnomalyType::DepthSequenceGap));
    }

    #[test]
    fn duplicate_suppression_uses_cooldown() {
        let mut engine = DetectorEngine::default();
        let settings = default_detector_settings();
        let state = state_with("BTCUSDT", Some(3.0), None, Some(1.0), test_time(0));

        let first = engine.evaluate(&state, &settings, test_time(10));
        let second = engine.evaluate(&state, &settings, test_time(11));

        assert_eq!(first.len(), 2);
        assert!(second.is_empty());
    }

    #[test]
    fn cooldown_uses_processing_time_when_market_event_time_moves_backwards() {
        let mut engine = DetectorEngine::default();
        let settings = default_detector_settings();
        let first_state = state_with("BTCUSDT", Some(3.0), None, None, test_time(30));
        let older_state = state_with("BTCUSDT", Some(3.0), None, None, test_time(0));

        let first = engine.evaluate(&first_state, &settings, test_time(30));
        let second = engine.evaluate(&older_state, &settings, test_time(61));

        assert_eq!(first.len(), 1);
        assert!(second.iter().any(|anomaly| anomaly.anomaly_type
            == crate::domain::AnomalyType::PriceMove
            && anomaly.event_time == test_time(0)));
    }

    fn state_with(
        raw_symbol: &str,
        price_change_1m_pct: Option<f64>,
        spread_pct: Option<f64>,
        trades_per_minute: Option<f64>,
        last_event_time: DateTime<Utc>,
    ) -> MarketState {
        let mut state = MarketState::new(symbol(raw_symbol));
        let mut signals = base_signals();
        signals.spread_pct = spread_pct;
        signals.price_change_1m_pct = price_change_1m_pct;
        signals.trades_per_minute = trades_per_minute;
        state.signals = signals;
        state.last_event_time = Some(last_event_time);
        state
    }

    fn top_of_book_state(
        raw_symbol: &str,
        last_event_time: DateTime<Utc>,
        top_ask_quantity: Decimal,
    ) -> MarketState {
        let mut state = MarketState::new(symbol(raw_symbol));
        state.best_bid_price = Some(Decimal::new(6500000, 2));
        state.best_bid_quantity = Some(Decimal::new(125, 2));
        state.best_ask_price = Some(Decimal::new(6500100, 2));
        state.best_ask_quantity = Some(Decimal::new(150, 2));
        state.top_bid_quantity = Some(Decimal::new(2, 0));
        state.top_ask_quantity = Some(top_ask_quantity);
        state.last_event_time = Some(last_event_time);
        state.last_ingest_time = Some(last_event_time);
        state
    }

    fn depth_gap_state(raw_symbol: &str, depth_sequence_gap_count: u64) -> MarketState {
        let last_event_time = test_time(10);
        let mut state = MarketState::new(symbol(raw_symbol));
        state.depth_sequence_gap_count = depth_sequence_gap_count;
        state.last_event_time = Some(last_event_time);
        state.last_ingest_time = Some(last_event_time);
        state.last_depth_event_time = Some(last_event_time);
        state
    }
}

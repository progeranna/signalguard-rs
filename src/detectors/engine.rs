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
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::DetectorEngine;
    use crate::{
        config::DetectorSettings,
        domain::{MarketSignals, MarketState, Symbol},
    };

    #[test]
    fn detector_engine_tracks_symbols_independently() {
        let mut engine = DetectorEngine::default();
        let btc_state = state_with(
            "BTCUSDT",
            Some(3.0),
            None,
            Some(1.0),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        );
        let eth_state = state_with(
            "ETHUSDT",
            Some(3.0),
            None,
            Some(1.0),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 1).unwrap(),
        );

        let btc = engine.evaluate(
            &btc_state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
        );
        let eth = engine.evaluate(
            &eth_state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
        );

        assert_eq!(btc.len(), 2);
        assert_eq!(eth.len(), 2);
    }

    #[test]
    fn quote_stuck_state_is_independent_per_symbol() {
        let mut engine = DetectorEngine::default();
        let settings = settings();

        let btc_first = top_of_book_state(
            "BTCUSDT",
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            Decimal::new(2, 0),
        );
        let eth_first = top_of_book_state(
            "ETHUSDT",
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            Decimal::new(2, 0),
        );
        let btc_second = top_of_book_state(
            "BTCUSDT",
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 11).unwrap(),
            Decimal::new(2, 0),
        );
        let eth_changed = top_of_book_state(
            "ETHUSDT",
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 11).unwrap(),
            Decimal::new(3, 0),
        );

        assert!(
            engine
                .evaluate(
                    &btc_first,
                    &settings,
                    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
                )
                .is_empty()
        );
        assert!(
            engine
                .evaluate(
                    &eth_first,
                    &settings,
                    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
                )
                .is_empty()
        );

        let btc_anomalies = engine.evaluate(
            &btc_second,
            &settings,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 11).unwrap(),
        );
        let eth_anomalies = engine.evaluate(
            &eth_changed,
            &settings,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 11).unwrap(),
        );

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
        let settings = settings();

        let btc_gap = depth_gap_state("BTCUSDT", 1);
        let eth_gap = depth_gap_state("ETHUSDT", 0);

        let btc_anomalies = engine.evaluate(
            &btc_gap,
            &settings,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
        );
        let eth_anomalies = engine.evaluate(
            &eth_gap,
            &settings,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
        );

        assert!(btc_anomalies.iter().any(|anomaly| anomaly.anomaly_type
            == crate::domain::AnomalyType::DepthSequenceGap));
        assert!(eth_anomalies
            .iter()
            .all(|anomaly| anomaly.anomaly_type != crate::domain::AnomalyType::DepthSequenceGap));
    }

    #[test]
    fn duplicate_suppression_uses_cooldown() {
        let mut engine = DetectorEngine::default();
        let state = state_with(
            "BTCUSDT",
            Some(3.0),
            None,
            Some(1.0),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        );

        let first = engine.evaluate(
            &state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
        );
        let second = engine.evaluate(
            &state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 11).unwrap(),
        );

        assert_eq!(first.len(), 2);
        assert!(second.is_empty());
    }

    #[test]
    fn cooldown_uses_processing_time_when_market_event_time_moves_backwards() {
        let mut engine = DetectorEngine::default();
        let first_state = state_with(
            "BTCUSDT",
            Some(3.0),
            None,
            None,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap(),
        );
        let older_state = state_with(
            "BTCUSDT",
            Some(3.0),
            None,
            None,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        );

        let first = engine.evaluate(
            &first_state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap(),
        );
        let second = engine.evaluate(
            &older_state,
            &settings(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 1).unwrap(),
        );

        assert_eq!(first.len(), 1);
        assert!(second.iter().any(|anomaly| anomaly.anomaly_type
            == crate::domain::AnomalyType::PriceMove
            && anomaly.event_time == Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()));
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

    fn state_with(
        symbol: &str,
        price_change_1m_pct: Option<f64>,
        spread_pct: Option<f64>,
        trades_per_minute: Option<f64>,
        last_event_time: chrono::DateTime<Utc>,
    ) -> MarketState {
        let mut state = MarketState::new(Symbol::new(symbol).unwrap());
        state.signals = MarketSignals {
            spread_pct,
            price_change_1m_pct,
            trades_per_minute,
        };
        state.last_event_time = Some(last_event_time);
        state
    }

    fn top_of_book_state(
        symbol: &str,
        last_event_time: chrono::DateTime<Utc>,
        top_ask_quantity: Decimal,
    ) -> MarketState {
        let mut state = MarketState::new(Symbol::new(symbol).unwrap());
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

    fn depth_gap_state(symbol: &str, depth_sequence_gap_count: u64) -> MarketState {
        let last_event_time = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap();
        let mut state = MarketState::new(Symbol::new(symbol).unwrap());
        state.depth_sequence_gap_count = depth_sequence_gap_count;
        state.last_event_time = Some(last_event_time);
        state.last_ingest_time = Some(last_event_time);
        state.last_depth_event_time = Some(last_event_time);
        state
    }
}

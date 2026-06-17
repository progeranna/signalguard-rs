use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::Symbol;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MarketState {
    pub symbol: Symbol,
    pub last_trade_price: Option<Decimal>,
    pub last_trade_quantity: Option<Decimal>,
    pub best_bid_price: Option<Decimal>,
    pub best_bid_quantity: Option<Decimal>,
    pub best_ask_price: Option<Decimal>,
    pub best_ask_quantity: Option<Decimal>,
    pub top_bid_quantity: Option<Decimal>,
    pub top_ask_quantity: Option<Decimal>,
    pub top_bid_liquidity: Option<Decimal>,
    pub top_ask_liquidity: Option<Decimal>,
    pub book_imbalance: Option<Decimal>,
    #[serde(default)]
    pub depth_sequence_gap_count: u64,
    pub last_depth_event_time: Option<DateTime<Utc>>,
    pub last_depth_ingest_time: Option<DateTime<Utc>>,
    pub signals: MarketSignals,
    pub last_event_time: Option<DateTime<Utc>>,
    pub last_ingest_time: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct MarketSignals {
    pub spread_pct: Option<f64>,
    pub price_change_1m_pct: Option<f64>,
    pub trades_per_minute: Option<f64>,
}

impl MarketState {
    pub fn new(symbol: Symbol) -> Self {
        Self {
            symbol,
            last_trade_price: None,
            last_trade_quantity: None,
            best_bid_price: None,
            best_bid_quantity: None,
            best_ask_price: None,
            best_ask_quantity: None,
            top_bid_quantity: None,
            top_ask_quantity: None,
            top_bid_liquidity: None,
            top_ask_liquidity: None,
            book_imbalance: None,
            depth_sequence_gap_count: 0,
            last_depth_event_time: None,
            last_depth_ingest_time: None,
            signals: MarketSignals::default(),
            last_event_time: None,
            last_ingest_time: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::MarketState;
    use crate::domain::Symbol;

    #[test]
    fn market_state_starts_empty() {
        let state = MarketState::new(Symbol::new("BTCUSDT").unwrap());

        assert!(state.last_trade_price.is_none());
        assert!(state.best_bid_price.is_none());
        assert!(state.top_bid_quantity.is_none());
        assert!(state.top_ask_quantity.is_none());
        assert!(state.top_bid_liquidity.is_none());
        assert!(state.top_ask_liquidity.is_none());
        assert!(state.book_imbalance.is_none());
        assert_eq!(state.depth_sequence_gap_count, 0);
        assert!(state.last_depth_event_time.is_none());
        assert!(state.last_depth_ingest_time.is_none());
        assert!(state.signals.spread_pct.is_none());
        assert!(state.last_event_time.is_none());
    }

    #[test]
    fn market_state_with_depth_fields_round_trips_through_json() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.top_bid_quantity = Some(rust_decimal::Decimal::new(120, 2));
        state.top_ask_quantity = Some(rust_decimal::Decimal::new(80, 2));
        state.top_bid_liquidity = Some(rust_decimal::Decimal::new(7805760, 2));
        state.top_ask_liquidity = Some(rust_decimal::Decimal::new(5204400, 2));
        state.book_imbalance = Some(rust_decimal::Decimal::new(2, 1));
        state.depth_sequence_gap_count = 2;

        let json = serde_json::to_string(&state).unwrap();
        let decoded: MarketState = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded, state);
    }

    #[test]
    fn market_state_deserializes_without_depth_fields() {
        let json = r#"{
            "symbol": "BTCUSDT",
            "last_trade_price": "65000.10",
            "last_trade_quantity": "0.125",
            "best_bid_price": "64999.10",
            "best_bid_quantity": "2.500",
            "best_ask_price": "65000.20",
            "best_ask_quantity": "1.750",
            "signals": {
                "spread_pct": 0.1,
                "price_change_1m_pct": 0.2,
                "trades_per_minute": 3.0
            },
            "last_event_time": null,
            "last_ingest_time": null
        }"#;

        let decoded: MarketState = serde_json::from_str(json).unwrap();

        assert_eq!(decoded.symbol.as_str(), "BTCUSDT");
        assert!(decoded.top_bid_quantity.is_none());
        assert!(decoded.top_ask_quantity.is_none());
        assert!(decoded.top_bid_liquidity.is_none());
        assert!(decoded.top_ask_liquidity.is_none());
        assert!(decoded.book_imbalance.is_none());
        assert_eq!(decoded.depth_sequence_gap_count, 0);
        assert!(decoded.last_depth_event_time.is_none());
        assert!(decoded.last_depth_ingest_time.is_none());
    }
}

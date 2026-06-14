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
        assert!(state.signals.spread_pct.is_none());
        assert!(state.last_event_time.is_none());
    }
}

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use rust_decimal::prelude::ToPrimitive;

use crate::{
    domain::{MarketState, QuoteEvent, Symbol, TradeEvent},
    ingestion::NormalizedEvent,
};

use super::window::{TradeSample, TradeWindow};

const TRADE_WINDOW_SECONDS: i64 = 60;

#[derive(Debug, Default)]
pub struct MarketStateAggregator {
    states: HashMap<Symbol, SymbolState>,
}

#[derive(Debug)]
struct SymbolState {
    latest_state: MarketState,
    latest_trade_event_time: Option<DateTime<Utc>>,
    latest_quote_event_time: Option<DateTime<Utc>>,
    trades: TradeWindow,
}

impl MarketStateAggregator {
    pub fn apply(&mut self, event: &NormalizedEvent) -> Symbol {
        match event {
            NormalizedEvent::Trade(trade) => {
                let symbol = trade.symbol.clone();
                self.symbol_state_mut(&symbol).apply_trade(trade);
                symbol
            }
            NormalizedEvent::Quote(quote) => {
                let symbol = quote.symbol.clone();
                self.symbol_state_mut(&symbol).apply_quote(quote);
                symbol
            }
        }
    }

    pub fn snapshot(&self, symbol: &Symbol) -> Option<MarketState> {
        self.states.get(symbol).map(SymbolState::snapshot)
    }
}

impl SymbolState {
    fn new(symbol: Symbol) -> Self {
        Self {
            latest_state: MarketState::new(symbol),
            latest_trade_event_time: None,
            latest_quote_event_time: None,
            trades: TradeWindow::new(Duration::seconds(TRADE_WINDOW_SECONDS)),
        }
    }

    fn apply_trade(&mut self, trade: &TradeEvent) {
        if self
            .latest_trade_event_time
            .is_none_or(|current| trade.event_time >= current)
        {
            self.latest_state.last_trade_price = Some(trade.price);
            self.latest_state.last_trade_quantity = Some(trade.quantity);
            self.latest_trade_event_time = Some(trade.event_time);
        }

        self.trades.push(TradeSample {
            event_time: trade.event_time,
            price: trade.price,
        });
        self.latest_state.last_event_time = Some(
            self.latest_state
                .last_event_time
                .map_or(trade.event_time, |current| current.max(trade.event_time)),
        );
        self.latest_state.last_ingest_time = Some(
            self.latest_state
                .last_ingest_time
                .map_or(trade.ingest_time, |current| current.max(trade.ingest_time)),
        );
        self.refresh_trade_signals();
    }

    fn apply_quote(&mut self, quote: &QuoteEvent) {
        if self
            .latest_quote_event_time
            .is_none_or(|current| quote.event_time >= current)
        {
            self.latest_state.best_bid_price = Some(quote.top_of_book.best_bid_price);
            self.latest_state.best_bid_quantity = Some(quote.top_of_book.best_bid_quantity);
            self.latest_state.best_ask_price = Some(quote.top_of_book.best_ask_price);
            self.latest_state.best_ask_quantity = Some(quote.top_of_book.best_ask_quantity);
            self.latest_state.signals.spread_pct = compute_spread_pct(
                quote.top_of_book.best_bid_price,
                quote.top_of_book.best_ask_price,
            );
            self.latest_quote_event_time = Some(quote.event_time);
        }

        self.latest_state.last_event_time = Some(
            self.latest_state
                .last_event_time
                .map_or(quote.event_time, |current| current.max(quote.event_time)),
        );
        self.latest_state.last_ingest_time = Some(
            self.latest_state
                .last_ingest_time
                .map_or(quote.ingest_time, |current| current.max(quote.ingest_time)),
        );
    }

    fn refresh_trade_signals(&mut self) {
        self.latest_state.signals.price_change_1m_pct = compute_price_change_pct(&self.trades);
        self.latest_state.signals.trades_per_minute = Some(self.trades.len() as f64);
    }

    fn snapshot(&self) -> MarketState {
        self.latest_state.clone()
    }
}

impl MarketStateAggregator {
    fn symbol_state_mut(&mut self, symbol: &Symbol) -> &mut SymbolState {
        self.states
            .entry(symbol.clone())
            .or_insert_with(|| SymbolState::new(symbol.clone()))
    }
}

fn compute_price_change_pct(trades: &TradeWindow) -> Option<f64> {
    let oldest = trades.oldest()?;
    let latest = trades.latest()?;

    if oldest.event_time == latest.event_time {
        return None;
    }

    let oldest_price = oldest.price.to_f64()?;
    let latest_price = latest.price.to_f64()?;

    if oldest_price <= 0.0 {
        return None;
    }

    Some(((latest_price - oldest_price) / oldest_price) * 100.0)
}

fn compute_spread_pct(
    best_bid_price: rust_decimal::Decimal,
    best_ask_price: rust_decimal::Decimal,
) -> Option<f64> {
    let bid = best_bid_price.to_f64()?;
    let ask = best_ask_price.to_f64()?;
    let mid = (bid + ask) / 2.0;

    if mid <= 0.0 {
        return None;
    }

    Some(((ask - bid) / mid) * 100.0)
}

pub fn last_event_age_ms(
    last_event_time: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
) -> Option<u64> {
    let age = now
        .signed_duration_since(last_event_time?)
        .num_milliseconds();

    Some(age.max(0) as u64)
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::{MarketStateAggregator, last_event_age_ms};
    use crate::{
        domain::{Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent},
        ingestion::NormalizedEvent,
    };

    #[test]
    fn trade_updates_last_trade_price_quantity_and_time() {
        let mut aggregator = MarketStateAggregator::default();
        let trade = trade("BTCUSDT", Decimal::new(100500, 2), Decimal::new(25, 2), 0);

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.last_trade_price, Some(Decimal::new(100500, 2)));
        assert_eq!(state.last_trade_quantity, Some(Decimal::new(25, 2)));
        assert_eq!(
            state.last_event_time,
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap())
        );
    }

    #[test]
    fn quote_updates_best_bid_ask_and_spread_pct() {
        let mut aggregator = MarketStateAggregator::default();
        let quote = quote(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(12, 1),
            Decimal::new(10020, 2),
            Decimal::new(9, 1),
            0,
        );

        let symbol = aggregator.apply(&NormalizedEvent::Quote(quote));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.best_bid_price, Some(Decimal::new(10000, 2)));
        assert_eq!(state.best_ask_price, Some(Decimal::new(10020, 2)));
        assert!(state.signals.spread_pct.unwrap() > 0.0);
    }

    #[test]
    fn price_change_is_none_with_insufficient_trade_data() {
        let mut aggregator = MarketStateAggregator::default();
        let trade = trade("BTCUSDT", Decimal::new(100500, 2), Decimal::new(25, 2), 0);

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.signals.price_change_1m_pct, None);
        assert_eq!(state.signals.trades_per_minute, Some(1.0));
    }

    #[test]
    fn price_change_uses_oldest_and_latest_trade_in_window() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            0,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(1, 0),
            30,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.signals.trades_per_minute, Some(2.0));
        assert_eq!(state.signals.price_change_1m_pct, Some(1.0));
    }

    #[test]
    fn old_trades_are_evicted_from_one_minute_window() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            0,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(1, 0),
            61,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.signals.price_change_1m_pct, None);
        assert_eq!(state.signals.trades_per_minute, Some(1.0));
    }

    #[test]
    fn out_of_order_trades_use_oldest_and_latest_by_event_time() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(1, 0),
            30,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            0,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10050, 2),
            Decimal::new(1, 0),
            15,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.signals.trades_per_minute, Some(3.0));
        assert_eq!(state.signals.price_change_1m_pct, Some(1.0));
        assert_eq!(state.last_trade_price, Some(Decimal::new(10100, 2)));
    }

    #[test]
    fn trades_per_minute_ignores_trades_older_than_latest_event_time_minus_window() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            0,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10050, 2),
            Decimal::new(1, 0),
            10,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(1, 0),
            70,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.signals.trades_per_minute, Some(2.0));
        assert_eq!(state.signals.price_change_1m_pct, Some(0.4975124378109453));
    }

    #[test]
    fn last_event_age_is_computed_deterministically() {
        let age = last_event_age_ms(
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap(),
        );

        assert_eq!(age, Some(5_000));
    }

    #[test]
    fn aggregator_tracks_symbols_independently() {
        let mut aggregator = MarketStateAggregator::default();

        let btc_symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            0,
        )));
        let eth_symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "ETHUSDT",
            Decimal::new(2000, 2),
            Decimal::new(2, 0),
            0,
        )));

        let btc_state = aggregator.snapshot(&btc_symbol).unwrap();
        let eth_state = aggregator.snapshot(&eth_symbol).unwrap();

        assert_eq!(btc_state.last_trade_price, Some(Decimal::new(10000, 2)));
        assert_eq!(eth_state.last_trade_price, Some(Decimal::new(2000, 2)));
        assert_ne!(btc_state.symbol, eth_state.symbol);
    }

    #[test]
    fn older_trade_does_not_overwrite_latest_trade_fields() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(2, 0),
            30,
        )));
        aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            10,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.last_trade_price, Some(Decimal::new(10100, 2)));
        assert_eq!(state.last_trade_quantity, Some(Decimal::new(2, 0)));
        assert_eq!(
            state.last_event_time,
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap())
        );
    }

    #[test]
    fn older_quote_does_not_overwrite_latest_quote_fields() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Quote(quote(
            "BTCUSDT",
            Decimal::new(10010, 2),
            Decimal::new(2, 0),
            Decimal::new(10020, 2),
            Decimal::new(3, 0),
            30,
        )));
        aggregator.apply(&NormalizedEvent::Quote(quote(
            "BTCUSDT",
            Decimal::new(9990, 2),
            Decimal::new(1, 0),
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            10,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.best_bid_price, Some(Decimal::new(10010, 2)));
        assert_eq!(state.best_ask_price, Some(Decimal::new(10020, 2)));
        assert_eq!(
            state.last_event_time,
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap())
        );
    }

    #[test]
    fn last_event_time_does_not_move_backwards() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10100, 2),
            Decimal::new(2, 0),
            30,
        )));
        aggregator.apply(&NormalizedEvent::Quote(quote(
            "BTCUSDT",
            Decimal::new(9990, 2),
            Decimal::new(1, 0),
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            10,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(
            state.last_event_time,
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap())
        );
    }

    #[test]
    fn last_ingest_time_does_not_move_backwards() {
        let mut aggregator = MarketStateAggregator::default();
        let newer = TradeEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(42),
            Decimal::new(10100, 2),
            Decimal::new(2, 0),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 0).unwrap(),
        )
        .unwrap();
        let older_ingest = TradeEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(42),
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 20).unwrap(),
        )
        .unwrap();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(newer));
        aggregator.apply(&NormalizedEvent::Trade(older_ingest));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(
            state.last_ingest_time,
            Some(Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 0).unwrap())
        );
    }

    fn trade(symbol: &str, price: Decimal, quantity: Decimal, second: u32) -> TradeEvent {
        let minute = second / 60;
        let second = second % 60;
        TradeEvent::new(
            Symbol::new(symbol).unwrap(),
            Exchange::Binance,
            Some(42),
            price,
            quantity,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
        )
        .unwrap()
    }

    fn quote(
        symbol: &str,
        bid_price: Decimal,
        bid_quantity: Decimal,
        ask_price: Decimal,
        ask_quantity: Decimal,
        second: u32,
    ) -> QuoteEvent {
        let minute = second / 60;
        let second = second % 60;
        QuoteEvent::new(
            Symbol::new(symbol).unwrap(),
            Exchange::Binance,
            TopOfBookQuote::new(bid_price, bid_quantity, ask_price, ask_quantity).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
        )
        .unwrap()
    }
}

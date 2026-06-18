use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use rust_decimal::prelude::ToPrimitive;

use crate::{
    domain::{DepthUpdate, MarketState, QuoteEvent, Symbol, TradeEvent},
    ingestion::NormalizedEvent,
};

use super::order_book::{OrderBook, OrderBookSnapshot};
use super::window::{TradeSample, TradeWindow};

const TRADE_WINDOW_SECONDS: i64 = 60;

#[derive(Debug, Default)]
pub struct MarketStateAggregator {
    // Source selection is expected to bound this set to configured symbols or replay fixtures.
    // This demo service keeps no eviction policy for per-symbol state.
    states: HashMap<Symbol, SymbolState>,
}

#[derive(Debug)]
struct SymbolState {
    latest_state: MarketState,
    latest_trade_event_time: Option<DateTime<Utc>>,
    latest_quote_event_time: Option<DateTime<Utc>>,
    trades: TradeWindow,
    order_book: OrderBook,
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
            NormalizedEvent::Depth(depth) => {
                let symbol = depth.symbol.clone();
                self.symbol_state_mut(&symbol).apply_depth(depth);
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
            order_book: OrderBook::default(),
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
        self.advance_timestamps(trade.event_time, trade.ingest_time);
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

        self.advance_timestamps(quote.event_time, quote.ingest_time);
    }

    fn apply_depth(&mut self, depth: &DepthUpdate) {
        if !self.order_book.apply(depth) {
            return;
        }

        let snapshot = self.order_book.snapshot();
        self.apply_order_book_snapshot(&snapshot);
        self.advance_timestamps(depth.event_time, depth.ingest_time);
    }

    fn advance_timestamps(&mut self, event_time: DateTime<Utc>, ingest_time: DateTime<Utc>) {
        self.latest_state.last_event_time = Some(
            self.latest_state
                .last_event_time
                .map_or(event_time, |current| current.max(event_time)),
        );
        self.latest_state.last_ingest_time = Some(
            self.latest_state
                .last_ingest_time
                .map_or(ingest_time, |current| current.max(ingest_time)),
        );
    }

    fn apply_order_book_snapshot(&mut self, snapshot: &OrderBookSnapshot) {
        self.latest_state.top_bid_quantity = snapshot.best_bid_quantity;
        self.latest_state.top_ask_quantity = snapshot.best_ask_quantity;
        self.latest_state.top_bid_liquidity = Some(snapshot.top_bid_liquidity);
        self.latest_state.top_ask_liquidity = Some(snapshot.top_ask_liquidity);
        self.latest_state.book_imbalance = snapshot.book_imbalance;
        self.latest_state.depth_sequence_gap_count = snapshot.depth_sequence_gap_count;
        self.latest_state.last_depth_event_time = snapshot.last_depth_event_time;
        self.latest_state.last_depth_ingest_time = snapshot.last_depth_ingest_time;
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
        domain::{
            DepthLevel, DepthUpdate, Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent,
        },
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

    #[test]
    fn depth_event_creates_market_state_for_symbol() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(100, 0, 2, 0)],
            vec![depth_level(101, 0, 3, 0)],
            4,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.symbol.as_str(), "BTCUSDT");
        assert!(state.last_trade_price.is_none());
        assert!(state.best_bid_price.is_none());
        assert!(state.signals.spread_pct.is_none());
        assert!(state.signals.price_change_1m_pct.is_none());
        assert!(state.signals.trades_per_minute.is_none());
    }

    #[test]
    fn depth_event_updates_order_book_through_aggregator() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(100, 0, 2, 0), depth_level(102, 0, 5, 0)],
            vec![depth_level(103, 0, 3, 0), depth_level(101, 0, 4, 0)],
            4,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.top_bid_quantity, Some(Decimal::new(5, 0)));
        assert_eq!(state.top_ask_quantity, Some(Decimal::new(4, 0)));
    }

    #[test]
    fn depth_state_includes_liquidity_and_imbalance() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(10, 0, 10, 0), depth_level(5, 0, 10, 0)],
            vec![depth_level(10, 0, 5, 0)],
            4,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.top_bid_liquidity, Some(Decimal::new(150, 0)));
        assert_eq!(state.top_ask_liquidity, Some(Decimal::new(50, 0)));
        assert_eq!(state.book_imbalance, Some(Decimal::new(5, 1)));
    }

    #[test]
    fn depth_state_includes_sequence_gap_count() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(100, 0, 1, 0)],
            vec![],
            4,
        )));
        aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(105),
            Some(106),
            vec![depth_level(101, 0, 1, 0)],
            vec![],
            5,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.depth_sequence_gap_count, 1);
    }

    #[test]
    fn depth_event_preserves_existing_trade_and_quote_fields() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Trade(trade(
            "BTCUSDT",
            Decimal::new(10000, 2),
            Decimal::new(1, 0),
            1,
        )));
        aggregator.apply(&NormalizedEvent::Quote(quote(
            "BTCUSDT",
            Decimal::new(9990, 2),
            Decimal::new(2, 0),
            Decimal::new(10010, 2),
            Decimal::new(3, 0),
            2,
        )));
        aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(100, 0, 5, 0)],
            vec![depth_level(101, 0, 6, 0)],
            3,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();

        assert_eq!(state.last_trade_price, Some(Decimal::new(10000, 2)));
        assert_eq!(state.last_trade_quantity, Some(Decimal::new(1, 0)));
        assert_eq!(state.best_bid_price, Some(Decimal::new(9990, 2)));
        assert_eq!(state.best_bid_quantity, Some(Decimal::new(2, 0)));
        assert_eq!(state.best_ask_price, Some(Decimal::new(10010, 2)));
        assert_eq!(state.best_ask_quantity, Some(Decimal::new(3, 0)));
        assert!(state.signals.spread_pct.is_some());
    }

    #[test]
    fn depth_event_updates_depth_and_latest_timestamps() {
        let mut aggregator = MarketStateAggregator::default();

        let symbol = aggregator.apply(&NormalizedEvent::Depth(depth_update(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![depth_level(100, 0, 5, 0)],
            vec![],
            4,
        )));
        let state = aggregator.snapshot(&symbol).unwrap();
        let expected_event_time = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 4).unwrap();

        assert_eq!(state.last_depth_event_time, Some(expected_event_time));
        assert_eq!(state.last_depth_ingest_time, Some(expected_event_time));
        assert_eq!(state.last_event_time, Some(expected_event_time));
        assert_eq!(state.last_ingest_time, Some(expected_event_time));
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

    fn depth_update(
        symbol: &str,
        first_update_id: Option<u64>,
        final_update_id: Option<u64>,
        bids: Vec<DepthLevel>,
        asks: Vec<DepthLevel>,
        second: u32,
    ) -> DepthUpdate {
        let minute = second / 60;
        let second = second % 60;
        DepthUpdate::new(
            Symbol::new(symbol).unwrap(),
            Exchange::Binance,
            first_update_id,
            final_update_id,
            bids,
            asks,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
            Utc.with_ymd_and_hms(2026, 1, 1, 0, minute, second).unwrap(),
        )
        .unwrap()
    }

    fn depth_level(
        price_units: i64,
        price_scale: u32,
        quantity_units: i64,
        quantity_scale: u32,
    ) -> DepthLevel {
        DepthLevel::new(
            Decimal::new(price_units, price_scale),
            Decimal::new(quantity_units, quantity_scale),
        )
        .unwrap()
    }
}

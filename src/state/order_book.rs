use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use crate::domain::{DepthLevel, DepthUpdate};

pub const DEFAULT_RETAINED_DEPTH_LEVELS: usize = 50;

#[derive(Clone, Debug, PartialEq)]
pub struct OrderBookSnapshot {
    pub best_bid_price: Option<Decimal>,
    pub best_bid_quantity: Option<Decimal>,
    pub best_ask_price: Option<Decimal>,
    pub best_ask_quantity: Option<Decimal>,
    pub top_bid_liquidity: Decimal,
    pub top_ask_liquidity: Decimal,
    pub book_imbalance: Option<Decimal>,
    pub last_depth_event_time: Option<DateTime<Utc>>,
    pub last_depth_ingest_time: Option<DateTime<Utc>>,
    pub last_first_update_id: Option<u64>,
    pub last_final_update_id: Option<u64>,
    pub depth_sequence_gap_count: u64,
}

#[derive(Debug)]
pub struct OrderBook {
    bids: BTreeMap<Decimal, Decimal>,
    asks: BTreeMap<Decimal, Decimal>,
    retained_depth_levels: usize,
    last_depth_event_time: Option<DateTime<Utc>>,
    last_depth_ingest_time: Option<DateTime<Utc>>,
    last_first_update_id: Option<u64>,
    last_final_update_id: Option<u64>,
    depth_sequence_gap_count: u64,
}

impl Default for OrderBook {
    fn default() -> Self {
        Self::new(DEFAULT_RETAINED_DEPTH_LEVELS)
    }
}

impl OrderBook {
    pub fn new(retained_depth_levels: usize) -> Self {
        Self {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            retained_depth_levels: retained_depth_levels.max(1),
            last_depth_event_time: None,
            last_depth_ingest_time: None,
            last_first_update_id: None,
            last_final_update_id: None,
            depth_sequence_gap_count: 0,
        }
    }

    pub fn apply(&mut self, update: &DepthUpdate) -> bool {
        if self.is_stale_or_duplicate(update) {
            return false;
        }

        if self.has_sequence_gap(update) {
            self.depth_sequence_gap_count += 1;
        }

        for level in &update.bids {
            apply_level(&mut self.bids, level);
        }
        for level in &update.asks {
            apply_level(&mut self.asks, level);
        }

        self.trim_bids();
        self.trim_asks();

        self.last_depth_event_time = Some(update.event_time);
        self.last_depth_ingest_time = Some(update.ingest_time);
        self.record_update_ids(update);
        true
    }

    pub fn snapshot(&self) -> OrderBookSnapshot {
        let (best_bid_price, best_bid_quantity) = best_bid(&self.bids);
        let (best_ask_price, best_ask_quantity) = best_ask(&self.asks);
        let top_bid_liquidity = total_liquidity(&self.bids);
        let top_ask_liquidity = total_liquidity(&self.asks);
        let total_liquidity = top_bid_liquidity + top_ask_liquidity;
        let book_imbalance = if total_liquidity > Decimal::ZERO {
            Some((top_bid_liquidity - top_ask_liquidity) / total_liquidity)
        } else {
            None
        };

        OrderBookSnapshot {
            best_bid_price,
            best_bid_quantity,
            best_ask_price,
            best_ask_quantity,
            top_bid_liquidity,
            top_ask_liquidity,
            book_imbalance,
            last_depth_event_time: self.last_depth_event_time,
            last_depth_ingest_time: self.last_depth_ingest_time,
            last_first_update_id: self.last_first_update_id,
            last_final_update_id: self.last_final_update_id,
            depth_sequence_gap_count: self.depth_sequence_gap_count,
        }
    }

    fn is_stale_or_duplicate(&self, update: &DepthUpdate) -> bool {
        let Some(previous_final_id) = self.last_final_update_id else {
            return false;
        };
        if update.first_update_id.is_none() {
            return false;
        }

        update
            .final_update_id
            .is_some_and(|final_id| final_id <= previous_final_id)
    }

    fn has_sequence_gap(&self, update: &DepthUpdate) -> bool {
        let (Some(previous_final_id), Some(first_update_id), Some(_final_update_id)) = (
            self.last_final_update_id,
            update.first_update_id,
            update.final_update_id,
        ) else {
            return false;
        };

        previous_final_id
            .checked_add(1)
            .is_some_and(|expected_next| first_update_id > expected_next)
    }

    fn record_update_ids(&mut self, update: &DepthUpdate) {
        match (update.first_update_id, update.final_update_id) {
            (Some(first_update_id), Some(final_update_id)) => {
                self.last_first_update_id = Some(first_update_id);
                self.last_final_update_id = Some(final_update_id);
            }
            (Some(first_update_id), None) => {
                if self
                    .last_first_update_id
                    .is_none_or(|previous_first_id| first_update_id >= previous_first_id)
                {
                    self.last_first_update_id = Some(first_update_id);
                }
            }
            (None, Some(final_update_id)) => {
                if self
                    .last_final_update_id
                    .is_none_or(|previous_final_id| final_update_id >= previous_final_id)
                {
                    self.last_final_update_id = Some(final_update_id);
                }
            }
            (None, None) => {}
        }
    }

    fn trim_bids(&mut self) {
        while self.bids.len() > self.retained_depth_levels {
            let Some(lowest_bid_price) = self.bids.keys().next().copied() else {
                break;
            };
            self.bids.remove(&lowest_bid_price);
        }
    }

    fn trim_asks(&mut self) {
        while self.asks.len() > self.retained_depth_levels {
            let Some(highest_ask_price) = self.asks.keys().next_back().copied() else {
                break;
            };
            self.asks.remove(&highest_ask_price);
        }
    }
}

fn apply_level(side: &mut BTreeMap<Decimal, Decimal>, level: &DepthLevel) {
    if level.quantity == Decimal::ZERO {
        side.remove(&level.price);
    } else {
        side.insert(level.price, level.quantity);
    }
}

fn best_bid(bids: &BTreeMap<Decimal, Decimal>) -> (Option<Decimal>, Option<Decimal>) {
    bids.iter()
        .next_back()
        .map(|(price, quantity)| (Some(*price), Some(*quantity)))
        .unwrap_or((None, None))
}

fn best_ask(asks: &BTreeMap<Decimal, Decimal>) -> (Option<Decimal>, Option<Decimal>) {
    asks.iter()
        .next()
        .map(|(price, quantity)| (Some(*price), Some(*quantity)))
        .unwrap_or((None, None))
}

fn total_liquidity(side: &BTreeMap<Decimal, Decimal>) -> Decimal {
    side.iter().fold(Decimal::ZERO, |total, (price, quantity)| {
        total + (*price * *quantity)
    })
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::OrderBook;
    use crate::domain::{DepthLevel, DepthUpdate, Exchange, Symbol};

    #[test]
    fn insert_bid_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![level(100, 0, 2, 0)], vec![]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(100, 0)));
        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(2, 0)));
    }

    #[test]
    fn insert_ask_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![], vec![level(101, 0, 3, 0)]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_ask_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.best_ask_quantity, Some(Decimal::new(3, 0)));
    }

    #[test]
    fn update_existing_bid_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![level(100, 0, 2, 0)], vec![]));
        book.apply(&depth_update(vec![level(100, 0, 5, 0)], vec![]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(5, 0)));
    }

    #[test]
    fn update_existing_ask_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![], vec![level(101, 0, 3, 0)]));
        book.apply(&depth_update(vec![], vec![level(101, 0, 4, 0)]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_ask_quantity, Some(Decimal::new(4, 0)));
    }

    #[test]
    fn zero_quantity_removes_bid_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![level(100, 0, 2, 0)], vec![]));
        book.apply(&depth_update(vec![level(100, 0, 0, 0)], vec![]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, None);
        assert_eq!(snapshot.best_bid_quantity, None);
    }

    #[test]
    fn zero_quantity_removes_ask_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![], vec![level(101, 0, 3, 0)]));
        book.apply(&depth_update(vec![], vec![level(101, 0, 0, 0)]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_ask_price, None);
        assert_eq!(snapshot.best_ask_quantity, None);
    }

    #[test]
    fn zero_retained_depth_keeps_one_level() {
        let mut book = OrderBook::new(0);
        book.apply(&depth_update(
            vec![level(100, 0, 1, 0), level(101, 0, 1, 0)],
            vec![level(102, 0, 1, 0), level(103, 0, 1, 0)],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.top_bid_liquidity, Decimal::new(101, 0));
        assert_eq!(snapshot.best_ask_price, Some(Decimal::new(102, 0)));
        assert_eq!(snapshot.top_ask_liquidity, Decimal::new(102, 0));
    }

    #[test]
    fn remove_after_update_clears_level() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(vec![level(100, 0, 2, 0)], vec![]));
        book.apply(&depth_update(vec![level(100, 0, 5, 0)], vec![]));
        book.apply(&depth_update(vec![level(100, 0, 0, 0)], vec![]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, None);
        assert_eq!(snapshot.best_bid_quantity, None);
        assert_eq!(snapshot.top_bid_liquidity, Decimal::ZERO);
    }

    #[test]
    fn bid_ordering_selects_highest_price_as_best_bid() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![
                level(100, 0, 1, 0),
                level(102, 0, 1, 0),
                level(101, 0, 1, 0),
            ],
            vec![],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(102, 0)));
    }

    #[test]
    fn ask_ordering_selects_lowest_price_as_best_ask() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![],
            vec![
                level(103, 0, 1, 0),
                level(101, 0, 1, 0),
                level(102, 0, 1, 0),
            ],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_ask_price, Some(Decimal::new(101, 0)));
    }

    #[test]
    fn top_n_trimming_keeps_highest_n_bids() {
        let mut book = OrderBook::new(2);
        book.apply(&depth_update(
            vec![
                level(100, 0, 1, 0),
                level(101, 0, 1, 0),
                level(102, 0, 1, 0),
            ],
            vec![],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(102, 0)));
        assert_eq!(snapshot.top_bid_liquidity, Decimal::new(203, 0));
    }

    #[test]
    fn top_n_trimming_keeps_order_after_retained_level_update() {
        let mut book = OrderBook::new(2);
        book.apply(&depth_update(
            vec![
                level(100, 0, 1, 0),
                level(101, 0, 1, 0),
                level(102, 0, 1, 0),
            ],
            vec![],
        ));
        book.apply(&depth_update(vec![level(101, 0, 3, 0)], vec![]));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(102, 0)));
        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(1, 0)));
        assert_eq!(snapshot.top_bid_liquidity, Decimal::new(405, 0));
    }

    #[test]
    fn top_n_trimming_keeps_lowest_n_asks() {
        let mut book = OrderBook::new(2);
        book.apply(&depth_update(
            vec![],
            vec![
                level(101, 0, 1, 0),
                level(102, 0, 1, 0),
                level(103, 0, 1, 0),
            ],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_ask_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.top_ask_liquidity, Decimal::new(203, 0));
    }

    #[test]
    fn snapshot_returns_best_bid_and_ask_quantities() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![level(100, 0, 2, 0), level(101, 0, 4, 0)],
            vec![level(102, 0, 3, 0), level(103, 0, 5, 0)],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(4, 0)));
        assert_eq!(snapshot.best_ask_price, Some(Decimal::new(102, 0)));
        assert_eq!(snapshot.best_ask_quantity, Some(Decimal::new(3, 0)));
    }

    #[test]
    fn top_bid_liquidity_is_computed() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![level(10, 0, 5, 0), level(8, 0, 2, 0)],
            vec![],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.top_bid_liquidity, Decimal::new(66, 0));
    }

    #[test]
    fn top_ask_liquidity_is_computed() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![],
            vec![level(11, 0, 4, 0), level(12, 0, 1, 0)],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.top_ask_liquidity, Decimal::new(56, 0));
    }

    #[test]
    fn book_imbalance_is_computed() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update(
            vec![level(10, 0, 10, 0), level(5, 0, 10, 0)],
            vec![level(10, 0, 5, 0)],
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.top_bid_liquidity, Decimal::new(150, 0));
        assert_eq!(snapshot.top_ask_liquidity, Decimal::new(50, 0));
        assert_eq!(snapshot.book_imbalance, Some(Decimal::new(5, 1)));
    }

    #[test]
    fn empty_book_snapshot_has_no_best_bid_ask_and_no_imbalance() {
        let snapshot = OrderBook::new(10).snapshot();

        assert_eq!(snapshot.best_bid_price, None);
        assert_eq!(snapshot.best_bid_quantity, None);
        assert_eq!(snapshot.best_ask_price, None);
        assert_eq!(snapshot.best_ask_quantity, None);
        assert_eq!(snapshot.top_bid_liquidity, Decimal::ZERO);
        assert_eq!(snapshot.top_ask_liquidity, Decimal::ZERO);
        assert_eq!(snapshot.book_imbalance, None);
    }

    #[test]
    fn update_ids_and_depth_timestamps_are_recorded() {
        let mut book = OrderBook::new(10);
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            test_time(5),
            test_time(6),
        )
        .unwrap();

        book.apply(&update);
        let snapshot = book.snapshot();

        assert_eq!(snapshot.last_first_update_id, Some(100));
        assert_eq!(snapshot.last_final_update_id, Some(101));
        assert_eq!(snapshot.last_depth_event_time, Some(test_time(5)));
        assert_eq!(snapshot.last_depth_ingest_time, Some(test_time(6)));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn first_update_with_ids_is_accepted() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            0,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(100, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(100));
        assert_eq!(snapshot.last_final_update_id, Some(101));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn contiguous_update_is_accepted_and_updates_last_ids() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(102),
            Some(103),
            vec![level(101, 0, 3, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(102));
        assert_eq!(snapshot.last_final_update_id, Some(103));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn gap_update_increments_depth_sequence_gap_count() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(105),
            Some(106),
            vec![level(101, 0, 3, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.depth_sequence_gap_count, 1);
        assert_eq!(snapshot.last_first_update_id, Some(105));
        assert_eq!(snapshot.last_final_update_id, Some(106));
    }

    #[test]
    fn multiple_gap_updates_increment_depth_sequence_gap_count() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(105),
            Some(106),
            vec![level(101, 0, 3, 0)],
            vec![],
            1,
        ));
        book.apply(&depth_update_with_ids(
            Some(110),
            Some(111),
            vec![level(102, 0, 4, 0)],
            vec![],
            2,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(102, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(110));
        assert_eq!(snapshot.last_final_update_id, Some(111));
        assert_eq!(snapshot.depth_sequence_gap_count, 2);
    }

    #[test]
    fn gap_update_applies_levels_for_now() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 2, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(105),
            Some(106),
            vec![level(101, 0, 3, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(3, 0)));
    }

    #[test]
    fn duplicate_or_stale_update_does_not_roll_book_state_back() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(99),
            Some(100),
            vec![level(100, 0, 1, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(100, 0)));
        assert_eq!(snapshot.best_bid_quantity, Some(Decimal::new(5, 0)));
        assert_eq!(snapshot.last_depth_event_time, Some(test_time(0)));
    }

    #[test]
    fn stale_update_after_gap_does_not_increment_depth_sequence_gap_count() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(105),
            Some(106),
            vec![level(101, 0, 3, 0)],
            vec![],
            1,
        ));
        book.apply(&depth_update_with_ids(
            Some(104),
            Some(105),
            vec![level(99, 0, 1, 0)],
            vec![],
            2,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(105));
        assert_eq!(snapshot.last_final_update_id, Some(106));
        assert_eq!(snapshot.depth_sequence_gap_count, 1);
    }

    #[test]
    fn duplicate_or_stale_update_does_not_update_last_final_update_id() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(101, 0, 1, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.last_first_update_id, Some(100));
        assert_eq!(snapshot.last_final_update_id, Some(101));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn missing_update_ids_apply_without_incrementing_gap_count() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            None,
            None,
            vec![level(101, 0, 2, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(100));
        assert_eq!(snapshot.last_final_update_id, Some(101));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn only_first_update_id_applies_without_sequence_validation() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(105),
            None,
            vec![level(101, 0, 2, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(105));
        assert_eq!(snapshot.last_final_update_id, Some(101));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn only_final_update_id_applies_without_sequence_validation() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            None,
            Some(105),
            vec![level(101, 0, 2, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(100));
        assert_eq!(snapshot.last_final_update_id, Some(105));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn overlapping_update_that_extends_final_id_applies_and_updates_last_ids() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(100),
            Some(105),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(104),
            Some(106),
            vec![level(101, 0, 2, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(101, 0)));
        assert_eq!(snapshot.last_first_update_id, Some(104));
        assert_eq!(snapshot.last_final_update_id, Some(106));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    #[test]
    fn depth_sequence_gap_count_is_independent_between_order_books() {
        let mut first_book = OrderBook::new(10);
        let mut second_book = OrderBook::new(10);

        first_book.apply(&depth_update_with_ids(
            Some(100),
            Some(101),
            vec![level(100, 0, 1, 0)],
            vec![],
            0,
        ));
        first_book.apply(&depth_update_with_ids(
            Some(105),
            Some(106),
            vec![level(101, 0, 1, 0)],
            vec![],
            1,
        ));
        second_book.apply(&depth_update_with_ids(
            Some(200),
            Some(201),
            vec![level(200, 0, 1, 0)],
            vec![],
            0,
        ));

        assert_eq!(first_book.snapshot().depth_sequence_gap_count, 1);
        assert_eq!(second_book.snapshot().depth_sequence_gap_count, 0);
    }

    #[test]
    fn max_previous_final_update_id_does_not_panic() {
        let mut book = OrderBook::new(10);
        book.apply(&depth_update_with_ids(
            Some(u64::MAX - 1),
            Some(u64::MAX),
            vec![level(100, 0, 5, 0)],
            vec![],
            0,
        ));
        book.apply(&depth_update_with_ids(
            Some(u64::MAX),
            Some(u64::MAX),
            vec![level(101, 0, 2, 0)],
            vec![],
            1,
        ));

        let snapshot = book.snapshot();

        assert_eq!(snapshot.best_bid_price, Some(Decimal::new(100, 0)));
        assert_eq!(snapshot.last_final_update_id, Some(u64::MAX));
        assert_eq!(snapshot.depth_sequence_gap_count, 0);
    }

    fn depth_update(bids: Vec<DepthLevel>, asks: Vec<DepthLevel>) -> DepthUpdate {
        depth_update_with_ids(None, None, bids, asks, 0)
    }

    fn depth_update_with_ids(
        first_update_id: Option<u64>,
        final_update_id: Option<u64>,
        bids: Vec<DepthLevel>,
        asks: Vec<DepthLevel>,
        event_second: u32,
    ) -> DepthUpdate {
        DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            first_update_id,
            final_update_id,
            bids,
            asks,
            test_time(event_second),
            test_time(event_second + 1),
        )
        .unwrap()
    }

    fn level(
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

    fn test_time(second: u32) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
    }
}

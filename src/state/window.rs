use std::collections::VecDeque;

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TradeSample {
    pub event_time: DateTime<Utc>,
    pub price: Decimal,
}

#[derive(Debug)]
pub struct TradeWindow {
    samples: VecDeque<TradeSample>,
    latest_event_time: Option<DateTime<Utc>>,
    window_size: Duration,
}

impl TradeWindow {
    pub fn new(window_size: Duration) -> Self {
        Self {
            samples: VecDeque::new(),
            latest_event_time: None,
            window_size,
        }
    }

    pub fn push(&mut self, sample: TradeSample) {
        self.latest_event_time = Some(
            self.latest_event_time
                .map_or(sample.event_time, |current| current.max(sample.event_time)),
        );

        let insert_at = self
            .samples
            .iter()
            .position(|existing| existing.event_time > sample.event_time)
            .unwrap_or(self.samples.len());
        self.samples.insert(insert_at, sample);
        self.evict_stale();
    }

    pub fn evict_before(&mut self, cutoff: DateTime<Utc>) {
        while let Some(sample) = self.samples.front() {
            if sample.event_time >= cutoff {
                break;
            }
            self.samples.pop_front();
        }
    }

    pub fn evict_stale(&mut self) {
        let Some(latest_event_time) = self.latest_event_time else {
            return;
        };

        self.evict_before(latest_event_time - self.window_size);
    }

    pub fn oldest(&self) -> Option<&TradeSample> {
        self.samples.front()
    }

    pub fn latest(&self) -> Option<&TradeSample> {
        self.samples.back()
    }

    pub fn len(&self) -> usize {
        self.samples.len()
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::{TradeSample, TradeWindow};

    #[test]
    fn old_trade_samples_are_evicted() {
        let mut window = TradeWindow::new(chrono::Duration::seconds(60));
        window.push(TradeSample {
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
            price: Decimal::new(100, 0),
        });
        window.push(TradeSample {
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 1).unwrap(),
            price: Decimal::new(101, 0),
        });

        assert_eq!(window.len(), 1);
        assert_eq!(window.oldest().unwrap().price, Decimal::new(101, 0));
    }

    #[test]
    fn out_of_order_trade_samples_stay_sorted_by_event_time() {
        let mut window = TradeWindow::new(chrono::Duration::seconds(60));
        window.push(TradeSample {
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 30).unwrap(),
            price: Decimal::new(101, 0),
        });
        window.push(TradeSample {
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 10).unwrap(),
            price: Decimal::new(100, 0),
        });
        window.push(TradeSample {
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 20).unwrap(),
            price: Decimal::new(1005, 1),
        });

        assert_eq!(window.oldest().unwrap().price, Decimal::new(100, 0));
        assert_eq!(window.latest().unwrap().price, Decimal::new(101, 0));
        assert_eq!(window.len(), 3);
    }
}

mod aggregator;
mod order_book;
mod window;

use chrono::{DateTime, Utc};

pub use aggregator::{MarketStateAggregator, last_event_age_ms};

pub fn snapshot_now() -> DateTime<Utc> {
    Utc::now()
}

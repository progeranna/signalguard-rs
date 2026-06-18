use std::sync::{
    Arc,
    atomic::{AtomicI64, AtomicU64, Ordering},
};

use chrono::{DateTime, Utc};

use crate::ingestion::{IngestionSource, NormalizedEvent};

#[derive(Clone, Debug, Default)]
pub struct InternalCounters {
    inner: Arc<CounterState>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InternalCountersSnapshot {
    pub parse_errors: u64,
    pub replay_parse_errors: u64,
    pub binance_parse_errors: u64,
    pub reconnect_attempts: u64,
    pub binance_reconnect_attempts: u64,
    pub storage_errors: u64,
    pub cache_errors: u64,
    pub replay_trade_events: u64,
    pub replay_quote_events: u64,
    pub replay_depth_events: u64,
    pub binance_trade_events: u64,
    pub binance_quote_events: u64,
    pub binance_depth_events: u64,
    pub last_message_unix_ms: Option<i64>,
    pub last_message_age_ms: Option<u64>,
}

#[derive(Debug, Default)]
struct CounterState {
    parse_errors: AtomicU64,
    replay_parse_errors: AtomicU64,
    binance_parse_errors: AtomicU64,
    reconnect_attempts: AtomicU64,
    binance_reconnect_attempts: AtomicU64,
    storage_errors: AtomicU64,
    cache_errors: AtomicU64,
    replay_trade_events: AtomicU64,
    replay_quote_events: AtomicU64,
    replay_depth_events: AtomicU64,
    binance_trade_events: AtomicU64,
    binance_quote_events: AtomicU64,
    binance_depth_events: AtomicU64,
    last_message_unix_ms: AtomicI64,
}

impl InternalCounters {
    pub fn increment_parse_errors(&self) {
        increment(&self.inner.parse_errors);
    }

    pub fn increment_reconnect_attempts(&self) {
        increment(&self.inner.reconnect_attempts);
    }

    pub fn increment_replay_parse_errors(&self) {
        self.increment_parse_errors();
        increment(&self.inner.replay_parse_errors);
    }

    pub fn increment_binance_parse_errors(&self) {
        self.increment_parse_errors();
        increment(&self.inner.binance_parse_errors);
    }

    pub fn increment_binance_reconnect_attempts(&self) {
        self.increment_reconnect_attempts();
        increment(&self.inner.binance_reconnect_attempts);
    }

    pub fn increment_storage_errors(&self) {
        increment(&self.inner.storage_errors);
    }

    pub fn increment_cache_errors(&self) {
        increment(&self.inner.cache_errors);
    }

    pub fn record_message_at(&self, timestamp: DateTime<Utc>) {
        self.inner
            .last_message_unix_ms
            .fetch_max(timestamp.timestamp_millis(), Ordering::Relaxed);
    }

    pub fn increment_replay_trade_events(&self) {
        increment(&self.inner.replay_trade_events);
    }

    pub fn increment_replay_quote_events(&self) {
        increment(&self.inner.replay_quote_events);
    }

    pub fn increment_replay_depth_events(&self) {
        increment(&self.inner.replay_depth_events);
    }

    pub fn increment_binance_trade_events(&self) {
        increment(&self.inner.binance_trade_events);
    }

    pub fn increment_binance_quote_events(&self) {
        increment(&self.inner.binance_quote_events);
    }

    pub fn increment_binance_depth_events(&self) {
        increment(&self.inner.binance_depth_events);
    }

    pub fn increment_processed_event(&self, source: IngestionSource, event: &NormalizedEvent) {
        match (source, event) {
            (IngestionSource::Replay, NormalizedEvent::Trade(_)) => {
                self.increment_replay_trade_events();
            }
            (IngestionSource::Replay, NormalizedEvent::Quote(_)) => {
                self.increment_replay_quote_events();
            }
            (IngestionSource::Replay, NormalizedEvent::Depth(_)) => {
                self.increment_replay_depth_events();
            }
            (IngestionSource::Binance, NormalizedEvent::Trade(_)) => {
                self.increment_binance_trade_events();
            }
            (IngestionSource::Binance, NormalizedEvent::Quote(_)) => {
                self.increment_binance_quote_events();
            }
            (IngestionSource::Binance, NormalizedEvent::Depth(_)) => {
                self.increment_binance_depth_events();
            }
        }
    }

    pub fn snapshot_at(&self, now: DateTime<Utc>) -> InternalCountersSnapshot {
        let last_message_unix_ms = self.last_message_unix_ms();

        InternalCountersSnapshot {
            parse_errors: self.inner.parse_errors.load(Ordering::Relaxed),
            replay_parse_errors: self.inner.replay_parse_errors.load(Ordering::Relaxed),
            binance_parse_errors: self.inner.binance_parse_errors.load(Ordering::Relaxed),
            reconnect_attempts: self.inner.reconnect_attempts.load(Ordering::Relaxed),
            binance_reconnect_attempts: self
                .inner
                .binance_reconnect_attempts
                .load(Ordering::Relaxed),
            storage_errors: self.inner.storage_errors.load(Ordering::Relaxed),
            cache_errors: self.inner.cache_errors.load(Ordering::Relaxed),
            replay_trade_events: self.inner.replay_trade_events.load(Ordering::Relaxed),
            replay_quote_events: self.inner.replay_quote_events.load(Ordering::Relaxed),
            replay_depth_events: self.inner.replay_depth_events.load(Ordering::Relaxed),
            binance_trade_events: self.inner.binance_trade_events.load(Ordering::Relaxed),
            binance_quote_events: self.inner.binance_quote_events.load(Ordering::Relaxed),
            binance_depth_events: self.inner.binance_depth_events.load(Ordering::Relaxed),
            last_message_unix_ms,
            last_message_age_ms: last_message_age_ms(last_message_unix_ms, now),
        }
    }

    fn last_message_unix_ms(&self) -> Option<i64> {
        let unix_ms = self.inner.last_message_unix_ms.load(Ordering::Relaxed);
        if unix_ms == 0 {
            return None;
        }

        Some(unix_ms)
    }
}

fn increment(counter: &AtomicU64) {
    counter.fetch_add(1, Ordering::Relaxed);
}

fn last_message_age_ms(last_message_unix_ms: Option<i64>, now: DateTime<Utc>) -> Option<u64> {
    let last_message_unix_ms = last_message_unix_ms?;
    Some(
        now.timestamp_millis()
            .saturating_sub(last_message_unix_ms)
            .max(0) as u64,
    )
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, TimeZone, Utc};

    use super::InternalCounters;

    #[test]
    fn parse_error_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_parse_errors();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.parse_errors, 1);
    }

    #[test]
    fn replay_parse_error_increment_updates_aggregate_and_source_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_replay_parse_errors();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.parse_errors, 1);
        assert_eq!(snapshot.replay_parse_errors, 1);
        assert_eq!(snapshot.binance_parse_errors, 0);
    }

    #[test]
    fn binance_parse_error_increment_updates_aggregate_and_source_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_binance_parse_errors();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.parse_errors, 1);
        assert_eq!(snapshot.replay_parse_errors, 0);
        assert_eq!(snapshot.binance_parse_errors, 1);
    }

    #[test]
    fn reconnect_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_reconnect_attempts();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.reconnect_attempts, 1);
    }

    #[test]
    fn binance_reconnect_increment_updates_aggregate_and_source_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_binance_reconnect_attempts();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.reconnect_attempts, 1);
        assert_eq!(snapshot.binance_reconnect_attempts, 1);
    }

    #[test]
    fn storage_error_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_storage_errors();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.storage_errors, 1);
    }

    #[test]
    fn cache_error_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_cache_errors();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.cache_errors, 1);
    }

    #[test]
    fn replay_trade_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_replay_trade_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.replay_trade_events, 1);
    }

    #[test]
    fn replay_quote_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_replay_quote_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.replay_quote_events, 1);
    }

    #[test]
    fn replay_depth_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_replay_depth_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.replay_depth_events, 1);
    }

    #[test]
    fn binance_trade_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_binance_trade_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.binance_trade_events, 1);
    }

    #[test]
    fn binance_quote_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_binance_quote_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.binance_quote_events, 1);
    }

    #[test]
    fn binance_depth_event_increment_appears_in_snapshot() {
        let counters = InternalCounters::default();
        counters.increment_binance_depth_events();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.binance_depth_events, 1);
    }

    #[test]
    fn snapshot_has_no_last_message_when_nothing_was_recorded() {
        let counters = InternalCounters::default();

        let snapshot = counters.snapshot_at(now());

        assert_eq!(snapshot.last_message_unix_ms, None);
        assert_eq!(snapshot.last_message_age_ms, None);
    }

    #[test]
    fn last_message_timestamp_appears_in_snapshot() {
        let counters = InternalCounters::default();
        let recorded_at = now();

        counters.record_message_at(recorded_at);

        let snapshot = counters.snapshot_at(recorded_at);

        assert_eq!(
            snapshot.last_message_unix_ms,
            Some(recorded_at.timestamp_millis())
        );
    }

    #[test]
    fn last_message_age_is_deterministic_with_injected_now() {
        let counters = InternalCounters::default();
        let recorded_at = now();
        let injected_now = recorded_at + Duration::seconds(3);

        counters.record_message_at(recorded_at);

        let snapshot = counters.snapshot_at(injected_now);

        assert_eq!(snapshot.last_message_age_ms, Some(3_000));
    }

    #[test]
    fn last_message_age_clamps_at_zero_when_now_is_earlier() {
        let counters = InternalCounters::default();
        let recorded_at = now();

        counters.record_message_at(recorded_at);

        let snapshot = counters.snapshot_at(recorded_at - Duration::seconds(1));

        assert_eq!(snapshot.last_message_age_ms, Some(0));
    }

    #[test]
    fn last_message_timestamp_keeps_the_latest_recorded_value() {
        let counters = InternalCounters::default();
        let first = now();
        let later = first + Duration::seconds(2);

        counters.record_message_at(later);
        counters.record_message_at(first);

        let snapshot = counters.snapshot_at(later + Duration::seconds(3));

        assert_eq!(
            snapshot.last_message_unix_ms,
            Some(later.timestamp_millis())
        );
        assert_eq!(snapshot.last_message_age_ms, Some(3_000));
    }

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap()
    }
}

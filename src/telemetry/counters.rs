use std::sync::{
    Arc,
    atomic::{AtomicI64, AtomicU64, Ordering},
};

#[cfg(test)]
use chrono::TimeZone;
use chrono::{DateTime, Utc};

#[derive(Clone, Debug, Default)]
pub struct InternalCounters {
    inner: Arc<CounterState>,
}

#[derive(Debug, Default)]
struct CounterState {
    parse_errors: AtomicU64,
    reconnect_attempts: AtomicU64,
    storage_errors: AtomicU64,
    cache_errors: AtomicU64,
    last_message_unix_ms: AtomicI64,
}

impl InternalCounters {
    pub fn increment_parse_errors(&self) {
        self.inner.parse_errors.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_reconnect_attempts(&self) {
        self.inner
            .reconnect_attempts
            .fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_storage_errors(&self) {
        self.inner.storage_errors.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_cache_errors(&self) {
        self.inner.cache_errors.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_message_at(&self, timestamp: DateTime<Utc>) {
        self.inner
            .last_message_unix_ms
            .fetch_max(timestamp.timestamp_millis(), Ordering::Relaxed);
    }

    #[cfg(test)]
    fn snapshot(&self, now: DateTime<Utc>) -> CounterSnapshot {
        CounterSnapshot {
            parse_errors: self.inner.parse_errors.load(Ordering::Relaxed),
            reconnect_attempts: self.inner.reconnect_attempts.load(Ordering::Relaxed),
            storage_errors: self.inner.storage_errors.load(Ordering::Relaxed),
            cache_errors: self.inner.cache_errors.load(Ordering::Relaxed),
            last_message_at: self.last_message_at(),
            last_message_age_ms: self.last_message_age_ms(now),
        }
    }

    #[cfg(test)]
    fn last_message_at(&self) -> Option<DateTime<Utc>> {
        let unix_ms = self.inner.last_message_unix_ms.load(Ordering::Relaxed);
        if unix_ms == 0 {
            return None;
        }

        Utc.timestamp_millis_opt(unix_ms).single()
    }

    #[cfg(test)]
    fn last_message_age_ms(&self, now: DateTime<Utc>) -> Option<u64> {
        let last_message_at = self.last_message_at()?;
        Some(
            now.signed_duration_since(last_message_at)
                .num_milliseconds()
                .max(0) as u64,
        )
    }
}

#[cfg(test)]
#[derive(Debug, PartialEq)]
struct CounterSnapshot {
    parse_errors: u64,
    reconnect_attempts: u64,
    storage_errors: u64,
    cache_errors: u64,
    last_message_at: Option<DateTime<Utc>>,
    last_message_age_ms: Option<u64>,
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, TimeZone, Utc};

    use super::InternalCounters;

    #[test]
    fn counters_start_at_zero() {
        let counters = InternalCounters::default();
        let now = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap();
        let snapshot = counters.snapshot(now);

        assert_eq!(snapshot.parse_errors, 0);
        assert_eq!(snapshot.reconnect_attempts, 0);
        assert_eq!(snapshot.storage_errors, 0);
        assert_eq!(snapshot.cache_errors, 0);
        assert_eq!(snapshot.last_message_at, None);
        assert_eq!(snapshot.last_message_age_ms, None);
    }

    #[test]
    fn counters_increment_independently() {
        let counters = InternalCounters::default();

        counters.increment_parse_errors();
        counters.increment_parse_errors();
        counters.increment_reconnect_attempts();
        counters.increment_storage_errors();
        counters.increment_cache_errors();
        counters.increment_cache_errors();

        let snapshot = counters.snapshot(Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap());

        assert_eq!(snapshot.parse_errors, 2);
        assert_eq!(snapshot.reconnect_attempts, 1);
        assert_eq!(snapshot.storage_errors, 1);
        assert_eq!(snapshot.cache_errors, 2);
    }

    #[test]
    fn last_message_timestamp_keeps_the_latest_recorded_value() {
        let counters = InternalCounters::default();
        let first = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap();
        let later = first + Duration::seconds(2);
        let now = later + Duration::seconds(3);

        counters.record_message_at(later);
        counters.record_message_at(first);

        let snapshot = counters.snapshot(now);

        assert_eq!(snapshot.last_message_at, Some(later));
        assert_eq!(snapshot.last_message_age_ms, Some(3_000));
    }
}

use chrono::{DateTime, Duration, TimeZone, Utc};
use rust_decimal::Decimal;

use crate::{
    config::DetectorSettings,
    detectors::engine::DetectionContext,
    domain::{MarketSignals, MarketState, Symbol},
};

pub(crate) fn symbol(value: &str) -> Symbol {
    Symbol::new(value).unwrap()
}

pub(crate) fn btc_symbol() -> Symbol {
    symbol("BTCUSDT")
}

pub(crate) fn test_time(seconds: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap() + Duration::seconds(seconds.into())
}

pub(crate) fn default_detector_settings() -> DetectorSettings {
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

pub(crate) fn base_signals() -> MarketSignals {
    MarketSignals {
        spread_pct: None,
        price_change_1m_pct: None,
        trades_per_minute: None,
    }
}

pub(crate) fn btc_market_state() -> MarketState {
    MarketState::new(btc_symbol())
}

pub(crate) fn market_state_with_signals(signals: MarketSignals) -> MarketState {
    let mut state = btc_market_state();
    state.signals = signals;
    state
}

pub(crate) fn context<'a>(
    state: &'a MarketState,
    settings: &'a DetectorSettings,
) -> DetectionContext<'a> {
    context_at(state, settings, test_time(60), test_time(30))
}

pub(crate) fn context_at<'a>(
    state: &'a MarketState,
    settings: &'a DetectorSettings,
    now: DateTime<Utc>,
    event_time: DateTime<Utc>,
) -> DetectionContext<'a> {
    DetectionContext {
        state,
        settings,
        now,
        event_time,
    }
}

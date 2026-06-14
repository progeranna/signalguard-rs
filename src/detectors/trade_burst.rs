use crate::{
    detectors::engine::DetectionContext,
    domain::{AnomalyEvent, AnomalyMeasurement, AnomalyType, Severity, Symbol},
};
use rust_decimal::prelude::ToPrimitive;

#[derive(Clone, Copy, Debug, Default)]
pub struct TradeBurstState {
    baseline: Option<f64>,
    observation_count: u32,
    last_evaluated_trades_per_minute: Option<f64>,
}

impl TradeBurstState {
    pub fn evaluate(
        &mut self,
        symbol: &Symbol,
        context: &DetectionContext<'_>,
    ) -> Option<AnomalyEvent> {
        let current = context.state.signals.trades_per_minute?;
        let settings = context.settings;

        if self.last_evaluated_trades_per_minute == Some(current) {
            return None;
        }

        self.last_evaluated_trades_per_minute = Some(current);
        let multiplier = settings.trade_burst_multiplier.to_f64().unwrap_or_default();

        match self.baseline {
            None => {
                self.baseline = Some(current);
                self.observation_count = 1;
                None
            }
            Some(baseline) if self.observation_count < settings.trade_burst_min_warmup_windows => {
                let next_count = self.observation_count + 1;
                self.baseline = Some(
                    ((baseline * self.observation_count as f64) + current) / next_count as f64,
                );
                self.observation_count = next_count;
                None
            }
            Some(baseline) => {
                let threshold = baseline * multiplier;
                let severity = if current >= threshold * 2.0 {
                    Severity::Critical
                } else {
                    Severity::Warning
                };
                let anomaly = if current >= threshold {
                    Some(AnomalyEvent::new(
                        symbol.clone(),
                        AnomalyType::TradeBurst,
                        severity,
                        format!(
                            "trade activity reached {:.2} trades/minute versus a {:.2} baseline with multiplier {:.2}",
                            current, baseline, multiplier
                        ),
                        AnomalyMeasurement {
                            observed_value: Some(current),
                            threshold_value: Some(threshold),
                        },
                        context.event_time,
                        context.now,
                    ))
                } else {
                    None
                };

                let next_count = self.observation_count + 1;
                self.baseline = Some(
                    ((baseline * self.observation_count as f64) + current) / next_count as f64,
                );
                self.observation_count = next_count;
                anomaly
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::TradeBurstState;
    use crate::{
        config::DetectorSettings,
        detectors::engine::DetectionContext,
        domain::{MarketSignals, MarketState, Symbol},
    };

    #[test]
    fn trade_burst_does_not_emit_before_warmup() {
        let mut burst_state = TradeBurstState::default();
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let settings = settings();

        for trades_per_minute in [1.0, 2.0, 3.0, 4.0] {
            let state = state_with_trades_per_minute(&symbol, trades_per_minute);
            assert!(
                burst_state
                    .evaluate(&symbol, &context(&state, &settings))
                    .is_none()
            );
        }
    }

    #[test]
    fn trade_burst_emits_after_warmup_when_threshold_exceeded() {
        let mut burst_state = TradeBurstState::default();
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let settings = settings();

        for trades_per_minute in [1.0, 2.0, 3.0, 4.0, 5.0] {
            let state = state_with_trades_per_minute(&symbol, trades_per_minute);
            let _ = burst_state.evaluate(&symbol, &context(&state, &settings));
        }

        let burst_state_snapshot = state_with_trades_per_minute(&symbol, 20.0);
        let anomaly = burst_state
            .evaluate(&symbol, &context(&burst_state_snapshot, &settings))
            .unwrap();

        assert_eq!(anomaly.anomaly_type, crate::domain::AnomalyType::TradeBurst);
        assert_eq!(anomaly.observed_value, Some(20.0));
        assert!(anomaly.threshold_value.unwrap() > 0.0);
    }

    #[test]
    fn trade_burst_ignores_repeated_trade_rate() {
        let mut burst_state = TradeBurstState::default();
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let settings = settings();
        let state = state_with_trades_per_minute(&symbol, 4.0);

        assert!(
            burst_state
                .evaluate(&symbol, &context(&state, &settings))
                .is_none()
        );
        let baseline = burst_state.baseline;
        let observation_count = burst_state.observation_count;

        assert!(
            burst_state
                .evaluate(&symbol, &context(&state, &settings))
                .is_none()
        );
        assert_eq!(burst_state.baseline, baseline);
        assert_eq!(burst_state.observation_count, observation_count);
    }

    fn settings() -> DetectorSettings {
        DetectorSettings {
            price_move_1m_pct_threshold: Decimal::new(25, 1),
            spread_spike_pct_threshold: Decimal::new(5, 1),
            stale_data_ms_threshold: 5_000,
            trade_burst_multiplier: Decimal::new(3, 0),
            trade_burst_min_warmup_windows: 5,
        }
    }

    fn context<'a>(state: &'a MarketState, settings: &'a DetectorSettings) -> DetectionContext<'a> {
        DetectionContext {
            state,
            settings,
            now: Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 0).unwrap(),
            event_time: Utc.with_ymd_and_hms(2026, 1, 1, 0, 1, 0).unwrap(),
        }
    }

    fn state_with_trades_per_minute(symbol: &Symbol, trades_per_minute: f64) -> MarketState {
        let mut state = MarketState::new(symbol.clone());
        state.signals = MarketSignals {
            spread_pct: None,
            price_change_1m_pct: None,
            trades_per_minute: Some(trades_per_minute),
        };
        state
    }
}

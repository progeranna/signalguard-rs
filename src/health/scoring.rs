use chrono::{DateTime, Duration, Utc};
use serde::Serialize;

use crate::{
    config::HealthScoreSettings,
    domain::{AnomalyEvent, AnomalyType, HealthStatus, MarketState, Severity},
    state::last_event_age_ms,
};

#[derive(Clone, Debug)]
pub struct HealthScoringInput<'a> {
    pub state: &'a MarketState,
    pub anomalies: &'a [AnomalyEvent],
    pub now: DateTime<Utc>,
    pub settings: &'a HealthScoreSettings,
    pub stale_data_ms_threshold: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct HealthEvaluation {
    pub base_score: u8,
    pub score: u8,
    pub status: HealthStatus,
    pub evaluated_at: DateTime<Utc>,
    pub recent_anomaly_count: usize,
    pub signals: MarketHealthSignals,
    pub penalties: Vec<HealthPenalty>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct MarketHealthSignals {
    pub spread_pct: Option<f64>,
    pub price_change_1m_pct: Option<f64>,
    pub trades_per_minute: Option<f64>,
    pub last_event_time: Option<DateTime<Utc>>,
    pub last_event_age_ms: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct HealthPenalty {
    pub reason: String,
    pub penalty: u8,
    pub anomaly_type: Option<AnomalyType>,
    pub severity: Option<Severity>,
    pub observed_value: Option<f64>,
    pub threshold_value: Option<f64>,
    pub event_time: Option<DateTime<Utc>>,
}

pub fn evaluate_health(input: HealthScoringInput<'_>) -> HealthEvaluation {
    let recent_anomalies = recent_anomalies(input.anomalies, input.now, input.settings);
    let mut penalties = Vec::new();

    for anomaly in &recent_anomalies {
        penalties.push(anomaly_penalty(anomaly, input.settings));
    }

    if is_stale(input.state, input.now, input.stale_data_ms_threshold)
        && !penalties
            .iter()
            .any(|penalty| penalty.anomaly_type == Some(AnomalyType::StaleData))
    {
        penalties.push(state_stale_penalty(
            input.state,
            input.now,
            input.settings.stale_data_penalty,
            input.stale_data_ms_threshold,
        ));
    }

    let total_penalty = penalties.iter().fold(0u16, |sum, penalty| {
        sum.saturating_add(u16::from(penalty.penalty))
    });
    let score = u16::from(input.settings.base_score)
        .saturating_sub(total_penalty)
        .min(100) as u8;

    HealthEvaluation {
        base_score: input.settings.base_score,
        score,
        status: input.settings.status_thresholds.classify(score),
        evaluated_at: input.now,
        recent_anomaly_count: recent_anomalies.len(),
        signals: MarketHealthSignals {
            spread_pct: input.state.signals.spread_pct,
            price_change_1m_pct: input.state.signals.price_change_1m_pct,
            trades_per_minute: input.state.signals.trades_per_minute,
            last_event_time: input.state.last_event_time,
            last_event_age_ms: last_event_age_ms(input.state.last_event_time, input.now),
        },
        penalties,
    }
}

fn recent_anomalies<'a>(
    anomalies: &'a [AnomalyEvent],
    now: DateTime<Utc>,
    settings: &HealthScoreSettings,
) -> Vec<&'a AnomalyEvent> {
    let window_start = now - Duration::seconds(settings.recent_anomaly_window_secs as i64);

    // Use created_at because it is when the detector emitted the anomaly.
    anomalies
        .iter()
        .filter(|anomaly| anomaly.created_at >= window_start && anomaly.created_at <= now)
        .collect()
}

fn anomaly_penalty(anomaly: &AnomalyEvent, settings: &HealthScoreSettings) -> HealthPenalty {
    let penalty = if anomaly.anomaly_type == AnomalyType::StaleData {
        settings.stale_data_penalty
    } else {
        severity_penalty(anomaly.severity, settings)
    };

    HealthPenalty {
        reason: format!(
            "recent {} anomaly with {} severity",
            anomaly.anomaly_type.as_str(),
            anomaly.severity.as_str()
        ),
        penalty,
        anomaly_type: Some(anomaly.anomaly_type),
        severity: Some(anomaly.severity),
        observed_value: anomaly.observed_value,
        threshold_value: anomaly.threshold_value,
        event_time: Some(anomaly.event_time),
    }
}

fn severity_penalty(severity: Severity, settings: &HealthScoreSettings) -> u8 {
    match severity {
        Severity::Info => settings.severity_penalties.info,
        Severity::Warning => settings.severity_penalties.warning,
        Severity::Critical => settings.severity_penalties.critical,
    }
}

fn is_stale(state: &MarketState, now: DateTime<Utc>, stale_data_ms_threshold: u64) -> bool {
    last_event_age_ms(state.last_event_time, now)
        .map(|age_ms| age_ms >= stale_data_ms_threshold)
        .unwrap_or(true)
}

fn state_stale_penalty(
    state: &MarketState,
    now: DateTime<Utc>,
    stale_data_penalty: u8,
    stale_data_ms_threshold: u64,
) -> HealthPenalty {
    HealthPenalty {
        reason: String::from(
            "latest market state is stale relative to configured detector threshold",
        ),
        penalty: stale_data_penalty,
        anomaly_type: Some(AnomalyType::StaleData),
        severity: None,
        observed_value: last_event_age_ms(state.last_event_time, now).map(|value| value as f64),
        threshold_value: Some(stale_data_ms_threshold as f64),
        event_time: state.last_event_time,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::{HealthScoringInput, evaluate_health};
    use crate::{
        config::{HealthScoreSettings, HealthStatusThresholds, SeverityPenaltySettings},
        domain::{
            AnomalyEvent, AnomalyMeasurement, AnomalyType, MarketSignals, MarketState, Severity,
            Symbol,
        },
    };

    #[test]
    fn health_starts_from_base_score() {
        let state = fresh_state();
        let settings = settings();
        let result = evaluate_health(input(&state, &[], &settings));

        assert_eq!(result.base_score, 100);
        assert_eq!(result.score, 100);
        assert!(result.penalties.is_empty());
    }

    #[test]
    fn warning_anomaly_subtracts_warning_penalty() {
        let state = fresh_state();
        let anomalies = vec![anomaly(Severity::Warning, AnomalyType::SpreadSpike, now())];
        let settings = settings();
        let result = evaluate_health(input(&state, &anomalies, &settings));

        assert_eq!(result.score, 85);
    }

    #[test]
    fn critical_anomaly_subtracts_critical_penalty() {
        let state = fresh_state();
        let anomalies = vec![anomaly(Severity::Critical, AnomalyType::PriceMove, now())];
        let settings = settings();
        let result = evaluate_health(input(&state, &anomalies, &settings));

        assert_eq!(result.score, 65);
    }

    #[test]
    fn stale_data_penalty_applies_when_state_is_stale() {
        let mut state = fresh_state();
        state.last_event_time = Some(now() - chrono::Duration::seconds(10));
        let settings = settings();
        let result = evaluate_health(input(&state, &[], &settings));

        assert_eq!(result.score, 75);
        assert!(
            result
                .penalties
                .iter()
                .any(|penalty| penalty.anomaly_type == Some(AnomalyType::StaleData))
        );
    }

    #[test]
    fn score_clamps_at_zero() {
        let state = fresh_state();
        let anomalies = vec![
            anomaly(Severity::Critical, AnomalyType::PriceMove, now()),
            anomaly(Severity::Critical, AnomalyType::SpreadSpike, now()),
            anomaly(Severity::Critical, AnomalyType::TradeBurst, now()),
        ];
        let settings = settings();
        let result = evaluate_health(input(&state, &anomalies, &settings));

        assert_eq!(result.score, 0);
    }

    #[test]
    fn status_classification_healthy_degraded_unhealthy_works() {
        let state = fresh_state();
        let settings = settings();
        let healthy = evaluate_health(input(&state, &[], &settings));
        let degraded_anomalies = vec![anomaly(Severity::Critical, AnomalyType::PriceMove, now())];
        let degraded = evaluate_health(input(&state, &degraded_anomalies, &settings));
        let unhealthy_anomalies = vec![
            anomaly(Severity::Critical, AnomalyType::PriceMove, now()),
            anomaly(Severity::Critical, AnomalyType::SpreadSpike, now()),
        ];
        let unhealthy = evaluate_health(input(&state, &unhealthy_anomalies, &settings));

        assert_eq!(healthy.status, crate::domain::HealthStatus::Healthy);
        assert_eq!(degraded.status, crate::domain::HealthStatus::Degraded);
        assert_eq!(unhealthy.status, crate::domain::HealthStatus::Unhealthy);
    }

    #[test]
    fn old_anomalies_outside_recent_window_do_not_affect_score() {
        let state = fresh_state();
        let anomalies = vec![anomaly(
            Severity::Critical,
            AnomalyType::PriceMove,
            now() - chrono::Duration::seconds(301),
        )];
        let settings = settings();
        let result = evaluate_health(input(&state, &anomalies, &settings));

        assert_eq!(result.score, 100);
        assert_eq!(result.recent_anomaly_count, 0);
    }

    #[test]
    fn penalties_explanations_are_included() {
        let state = fresh_state();
        let anomalies = vec![anomaly(Severity::Warning, AnomalyType::TradeBurst, now())];
        let settings = settings();
        let result = evaluate_health(input(&state, &anomalies, &settings));
        let penalty = result.penalties.first().unwrap();

        assert!(penalty.reason.contains("recent trade_burst anomaly"));
        assert_eq!(penalty.penalty, 15);
        assert_eq!(penalty.observed_value, Some(42.0));
        assert_eq!(penalty.threshold_value, Some(10.0));
    }

    #[test]
    fn created_at_is_used_for_recent_anomaly_window_filtering() {
        let state = fresh_state();
        let mut old_by_creation = anomaly(Severity::Critical, AnomalyType::PriceMove, now());
        old_by_creation.event_time = now();
        old_by_creation.created_at = now() - chrono::Duration::seconds(301);
        let settings = settings();
        let result = evaluate_health(input(&state, &[old_by_creation], &settings));

        assert_eq!(result.score, 100);
    }

    #[test]
    fn deterministic_with_injected_now() {
        let state = fresh_state();
        let anomalies = vec![anomaly(Severity::Warning, AnomalyType::SpreadSpike, now())];
        let settings = settings();
        let first = evaluate_health(input(&state, &anomalies, &settings));
        let second = evaluate_health(input(&state, &anomalies, &settings));

        assert_eq!(first, second);
    }

    fn input<'a>(
        state: &'a MarketState,
        anomalies: &'a [AnomalyEvent],
        settings: &'a HealthScoreSettings,
    ) -> HealthScoringInput<'a> {
        HealthScoringInput {
            state,
            anomalies,
            now: now(),
            settings,
            stale_data_ms_threshold: 5_000,
        }
    }

    fn settings() -> HealthScoreSettings {
        HealthScoreSettings {
            base_score: 100,
            severity_penalties: SeverityPenaltySettings {
                info: 5,
                warning: 15,
                critical: 35,
            },
            stale_data_penalty: 25,
            recent_anomaly_window_secs: 300,
            status_thresholds: HealthStatusThresholds {
                healthy_min_score: 80,
                degraded_min_score: 50,
            },
        }
    }

    fn fresh_state() -> MarketState {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_trade_price = Some(Decimal::new(100, 0));
        state.last_event_time = Some(now() - chrono::Duration::seconds(1));
        state.signals = MarketSignals {
            spread_pct: Some(0.1),
            price_change_1m_pct: Some(0.2),
            trades_per_minute: Some(12.0),
        };
        state
    }

    fn anomaly(
        severity: Severity,
        anomaly_type: AnomalyType,
        created_at: chrono::DateTime<Utc>,
    ) -> AnomalyEvent {
        AnomalyEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            anomaly_type,
            severity,
            "test anomaly",
            AnomalyMeasurement {
                observed_value: Some(42.0),
                threshold_value: Some(10.0),
            },
            created_at - chrono::Duration::seconds(1),
            created_at,
        )
    }

    fn now() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 5, 0).unwrap()
    }
}

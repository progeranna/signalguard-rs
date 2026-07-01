use sqlx::PgPool;

use crate::{
    config::{DetectorSettings, HealthScoreSettings},
    storage::RedisCache,
    telemetry::InternalCounters,
};

#[cfg(test)]
use crate::domain::AnomalyEvent;

#[derive(Clone)]
pub struct AppState {
    pub pg_pool: PgPool,
    pub redis_cache: RedisCache,
    pub detector_settings: DetectorSettings,
    pub health_settings: HealthScoreSettings,
    pub counters: InternalCounters,
    #[cfg(test)]
    pub test_recent_anomalies: Option<Vec<AnomalyEvent>>,
}

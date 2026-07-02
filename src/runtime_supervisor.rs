use anyhow::{Context, Result, bail};
use chrono::Utc;
use sqlx::PgPool;
use tokio::{sync::Mutex, sync::watch, task::JoinHandle};

use crate::{
    config::{BinanceSettings, DetectorSettings, IngestionMode, IngestionSettings},
    ingestion,
    runtime::{RuntimeModeHandle, RuntimeModeSnapshot, RuntimeModeStatus},
    storage::{self, RedisCache},
    telemetry::InternalCounters,
};

pub struct IngestionSupervisor {
    runtime_mode: RuntimeModeHandle,
    active_task: Mutex<Option<ActiveIngestionTask>>,
    ingestion_settings: IngestionSettings,
    binance_settings: BinanceSettings,
    detector_settings: DetectorSettings,
    pg_pool: PgPool,
    redis_cache: RedisCache,
    counters: InternalCounters,
}

struct ActiveIngestionTask {
    kind: ActiveIngestionKind,
    join_handle: JoinHandle<Result<()>>,
    shutdown_tx: Option<watch::Sender<bool>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActiveIngestionKind {
    Replay,
    Live,
}

impl IngestionSupervisor {
    pub fn new(
        ingestion_settings: &IngestionSettings,
        binance_settings: &BinanceSettings,
        detector_settings: &DetectorSettings,
        pg_pool: PgPool,
        redis_cache: RedisCache,
        counters: InternalCounters,
    ) -> Self {
        let started_at = Utc::now();

        Self {
            runtime_mode: RuntimeModeHandle::new(RuntimeModeSnapshot::from_startup_config(
                ingestion_settings.mode,
                &ingestion_settings.symbols,
                started_at,
            )),
            active_task: Mutex::new(None),
            ingestion_settings: ingestion_settings.clone(),
            binance_settings: binance_settings.clone(),
            detector_settings: detector_settings.clone(),
            pg_pool,
            redis_cache,
            counters,
        }
    }

    pub fn runtime_mode_handle(&self) -> RuntimeModeHandle {
        self.runtime_mode.clone()
    }

    pub async fn start_initial(&self) -> Result<()> {
        let mut active_task = self.active_task.lock().await;
        if active_task.is_some() {
            bail!("initial ingestion task is already running");
        }

        let task = match self.ingestion_settings.mode {
            IngestionMode::Replay => self.spawn_replay_task(),
            IngestionMode::Live => self.spawn_live_task(),
        };
        *active_task = Some(task);

        Ok(())
    }

    pub async fn shutdown(&self) -> Result<()> {
        let active_task = {
            let mut active_task = self.active_task.lock().await;
            active_task.take()
        };

        let Some(active_task) = active_task else {
            return Ok(());
        };

        if let Some(shutdown_tx) = active_task.shutdown_tx {
            let _ = shutdown_tx.send(true);
        }

        join_task(active_task.kind, active_task.join_handle).await
    }

    fn spawn_replay_task(&self) -> ActiveIngestionTask {
        let runtime_mode = self.runtime_mode.clone();
        let settings = self.ingestion_settings.clone();
        let detector_settings = self.detector_settings.clone();
        let pg_pool = self.pg_pool.clone();
        let redis_cache = self.redis_cache.clone();
        let counters = self.counters.clone();

        mark_runtime_started(&runtime_mode);

        let join_handle = tokio::spawn(async move {
            let result = async {
                reset_replay_storage_if_needed(&settings, &pg_pool).await?;
                ingestion::run_replay_ingestion(
                    &settings,
                    pg_pool,
                    redis_cache,
                    detector_settings,
                    counters,
                )
                .await
                .context("failed to run replay ingestion")?;

                Ok(())
            }
            .await;

            match &result {
                Ok(()) => {
                    runtime_mode.update(|snapshot| {
                        snapshot.status = RuntimeModeStatus::Completed;
                        snapshot.last_error = None;
                    });
                }
                Err(error) => mark_runtime_failed(&runtime_mode, error),
            }

            result
        });

        ActiveIngestionTask {
            kind: ActiveIngestionKind::Replay,
            join_handle,
            shutdown_tx: None,
        }
    }

    fn spawn_live_task(&self) -> ActiveIngestionTask {
        let runtime_mode = self.runtime_mode.clone();
        let settings = self.ingestion_settings.clone();
        let binance_settings = self.binance_settings.clone();
        let detector_settings = self.detector_settings.clone();
        let pg_pool = self.pg_pool.clone();
        let redis_cache = self.redis_cache.clone();
        let counters = self.counters.clone();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        mark_runtime_started(&runtime_mode);

        let join_handle = tokio::spawn(async move {
            let result = ingestion::run_live_ingestion(
                &settings,
                &binance_settings,
                pg_pool,
                redis_cache,
                detector_settings,
                counters,
                shutdown_rx,
            )
            .await
            .context("failed to run live ingestion")
            .map(|_| ());

            if let Err(error) = &result {
                mark_runtime_failed(&runtime_mode, error);
            }

            result
        });

        ActiveIngestionTask {
            kind: ActiveIngestionKind::Live,
            join_handle,
            shutdown_tx: Some(shutdown_tx),
        }
    }
}

fn mark_runtime_started(runtime_mode: &RuntimeModeHandle) {
    let started_at = Utc::now();
    runtime_mode.update(|snapshot| {
        snapshot.status = RuntimeModeStatus::Running;
        snapshot.last_started_at = started_at;
        snapshot.last_error = None;
    });
}

fn mark_runtime_failed(runtime_mode: &RuntimeModeHandle, error: &anyhow::Error) {
    runtime_mode.update(|snapshot| {
        snapshot.status = RuntimeModeStatus::Failed;
        snapshot.last_error = Some(error.to_string());
    });
}

async fn join_task(kind: ActiveIngestionKind, join_handle: JoinHandle<Result<()>>) -> Result<()> {
    join_handle
        .await
        .with_context(|| format!("{kind:?} ingestion task failed to join"))?
        .with_context(|| format!("{kind:?} ingestion task exited with an error"))
}

async fn reset_replay_storage_if_needed(
    settings: &IngestionSettings,
    postgres_pool: &PgPool,
) -> Result<()> {
    if settings.replay_reset_storage {
        storage::postgres::reset_replay_storage(postgres_pool)
            .await
            .context("failed to reset replay historical tables")?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use chrono::Utc;
    use rust_decimal::Decimal;
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

    use super::IngestionSupervisor;
    use crate::{
        config::{BinanceSettings, DetectorSettings, IngestionMode, IngestionSettings},
        domain::Symbol,
        runtime::RuntimeModeStatus,
        storage::RedisCache,
        telemetry::InternalCounters,
    };

    #[tokio::test]
    async fn supervisor_initializes_runtime_snapshot_from_config() {
        let supervisor = test_supervisor(IngestionMode::Replay);
        let snapshot = supervisor.runtime_mode_handle().snapshot();

        assert_eq!(snapshot.mode.as_str(), "replay");
        assert_eq!(snapshot.status, RuntimeModeStatus::Running);
        assert_eq!(snapshot.symbols.len(), 1);
        assert!(!snapshot.switching_supported);
    }

    #[tokio::test]
    async fn replay_completion_sets_runtime_status_to_completed() {
        let supervisor = test_supervisor(IngestionMode::Replay);

        supervisor.start_initial().await.unwrap();
        supervisor.shutdown().await.unwrap();

        assert_eq!(
            supervisor.runtime_mode_handle().snapshot().status,
            RuntimeModeStatus::Completed
        );
    }

    fn test_supervisor(mode: IngestionMode) -> IngestionSupervisor {
        IngestionSupervisor::new(
            &IngestionSettings {
                mode,
                symbols: vec![Symbol::new("BTCUSDT").unwrap()],
                replay_path: PathBuf::from("examples/replay/sample.jsonl"),
                replay_delay_ms: 0,
                replay_reset_storage: false,
                event_channel_capacity: 16,
            },
            &BinanceSettings {
                websocket_base_url: String::from("wss://stream.binance.com:9443"),
                reconnect_min_backoff_ms: 500,
                reconnect_max_backoff_ms: 5_000,
            },
            &DetectorSettings {
                price_move_1m_pct_threshold: Decimal::new(25, 1),
                spread_spike_pct_threshold: Decimal::new(5, 1),
                stale_data_ms_threshold: 5_000,
                trade_burst_multiplier: Decimal::new(3, 0),
                trade_burst_min_warmup_windows: 5,
                quote_stuck_ms_threshold: 10_000,
                event_lag_spike_ms_threshold: 3_000,
                depth_sequence_gap_min_increment: 1,
            },
            unused_test_pool(),
            RedisCache::in_memory(Vec::new()),
            InternalCounters::default(),
        )
    }

    fn unused_test_pool() -> sqlx::PgPool {
        PgPoolOptions::new().max_connections(1).connect_lazy_with(
            PgConnectOptions::new()
                .host("/tmp/signalguard-rs-test-unused-postgres")
                .username("signalguard")
                .password("signalguard")
                .database("signalguard"),
        )
    }

    #[allow(dead_code)]
    fn _now() -> chrono::DateTime<Utc> {
        Utc::now()
    }
}

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use anyhow::{Context, Result, bail};
use chrono::Utc;
use sqlx::PgPool;
use thiserror::Error;
use tokio::{sync::Mutex, sync::watch, task::JoinHandle};

use crate::{
    config::{BinanceSettings, DetectorSettings, IngestionMode, IngestionSettings},
    domain::Symbol,
    ingestion,
    runtime::{
        RuntimeMode, RuntimeModeHandle, RuntimeModeSnapshot, RuntimeModeSource, RuntimeModeStatus,
        RuntimeResetPolicy,
    },
    storage::{self, RedisCache},
    telemetry::InternalCounters,
};

pub struct IngestionSupervisor {
    runtime_mode: RuntimeModeHandle,
    active_task: Mutex<Option<ActiveIngestionTask>>,
    switch_guard: Mutex<()>,
    ingestion_settings: IngestionSettings,
    binance_settings: BinanceSettings,
    detector_settings: DetectorSettings,
    pg_pool: PgPool,
    redis_cache: RedisCache,
    counters: InternalCounters,
    next_run_id: AtomicU64,
    current_run_id: Arc<AtomicU64>,
}

struct ActiveIngestionTask {
    run_id: u64,
    kind: ActiveIngestionKind,
    join_handle: JoinHandle<Result<()>>,
    shutdown_tx: Option<watch::Sender<bool>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ActiveIngestionKind {
    Replay,
    Live,
}

#[derive(Clone, Debug)]
pub struct RuntimeModeSwitchCommand {
    pub mode: String,
    pub symbols: Option<Vec<String>>,
    pub reset_state: Option<bool>,
    pub reset_storage: Option<bool>,
}

#[derive(Debug, Error)]
pub enum SwitchModeError {
    #[error("{0}")]
    Validation(String),
    #[error("runtime mode switch is already in progress")]
    Conflict,
    #[error(transparent)]
    Execution(#[from] anyhow::Error),
}

#[derive(Clone, Debug)]
struct ResolvedSwitchRequest {
    mode: IngestionMode,
    symbols: Vec<Symbol>,
    reset_policy: RuntimeResetPolicy,
}

impl IngestionSupervisor {
    pub fn new(
        ingestion_settings: &IngestionSettings,
        binance_settings: &BinanceSettings,
        detector_settings: &DetectorSettings,
        switching_supported: bool,
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
                switching_supported,
            )),
            active_task: Mutex::new(None),
            switch_guard: Mutex::new(()),
            ingestion_settings: ingestion_settings.clone(),
            binance_settings: binance_settings.clone(),
            detector_settings: detector_settings.clone(),
            pg_pool,
            redis_cache,
            counters,
            next_run_id: AtomicU64::new(1),
            current_run_id: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn runtime_mode_handle(&self) -> RuntimeModeHandle {
        self.runtime_mode.clone()
    }

    pub async fn start_initial(&self) -> Result<()> {
        let run_id = self.next_run_id();
        self.current_run_id.store(run_id, Ordering::SeqCst);
        self.start_mode(self.ingestion_settings.clone(), run_id, true)
            .await
    }

    pub async fn shutdown(&self) -> Result<()> {
        self.shutdown_active_ingestion().await
    }

    pub async fn shutdown_active_ingestion(&self) -> Result<()> {
        self.shutdown_active_ingestion_with_status(true).await
    }

    pub async fn reset_runtime_state(&self, policy: RuntimeResetPolicy) -> Result<()> {
        self.reset_runtime_state_with_status(policy, true).await
    }

    pub async fn stop_and_reset(&self, policy: RuntimeResetPolicy) -> Result<()> {
        self.shutdown_active_ingestion_with_status(true).await?;
        self.reset_runtime_state_with_status(policy, true).await
    }

    pub async fn switch_mode(
        &self,
        command: RuntimeModeSwitchCommand,
    ) -> std::result::Result<RuntimeModeSnapshot, SwitchModeError> {
        let request = self.resolve_switch_request(command)?;
        let _switch_guard = self
            .switch_guard
            .try_lock()
            .map_err(|_| SwitchModeError::Conflict)?;
        let run_id = self.next_run_id();

        self.current_run_id.store(run_id, Ordering::SeqCst);
        self.runtime_mode.update(|snapshot| {
            snapshot.mode = RuntimeMode::from(request.mode);
            snapshot.status = RuntimeModeStatus::Switching;
            snapshot.symbols = request.symbols.clone();
            snapshot.source = RuntimeModeSource::Runtime;
            snapshot.last_error = None;
        });

        if let Err(error) = self.shutdown_active_ingestion_with_status(false).await {
            mark_runtime_failed(
                &self.runtime_mode,
                self.current_run_id.as_ref(),
                run_id,
                &error,
            );
            return Err(SwitchModeError::Execution(error));
        }
        self.reset_runtime_state_with_status(request.reset_policy, false)
            .await
            .map_err(SwitchModeError::Execution)?;

        let settings = self.settings_for_mode(request.mode, request.symbols.clone());
        if let Err(error) = self.start_mode(settings, run_id, false).await {
            mark_runtime_failed(
                &self.runtime_mode,
                self.current_run_id.as_ref(),
                run_id,
                &error,
            );
            return Err(SwitchModeError::Execution(error));
        }

        let switched_at = Utc::now();
        update_runtime_if_current(
            &self.runtime_mode,
            self.current_run_id.as_ref(),
            run_id,
            |snapshot| {
                snapshot.mode = RuntimeMode::from(request.mode);
                snapshot.symbols = request.symbols.clone();
                snapshot.source = RuntimeModeSource::Runtime;
                snapshot.last_switched_at = Some(switched_at);
                snapshot.last_error = None;
            },
        );

        Ok(self.runtime_mode.snapshot())
    }

    async fn start_mode(
        &self,
        settings: IngestionSettings,
        run_id: u64,
        reset_storage_before_start: bool,
    ) -> Result<()> {
        let mut active_task = self.active_task.lock().await;
        if active_task.is_some() {
            bail!("ingestion task is already running");
        }

        let task = match settings.mode {
            IngestionMode::Replay => {
                self.spawn_replay_task(settings, run_id, reset_storage_before_start)
            }
            IngestionMode::Live => self.spawn_live_task(settings, run_id),
        };
        *active_task = Some(task);

        Ok(())
    }

    async fn shutdown_active_ingestion_with_status(
        &self,
        mark_stopped_on_success: bool,
    ) -> Result<()> {
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

        let kind = active_task.kind;
        let run_id = active_task.run_id;
        let join_result = join_task(kind, active_task.join_handle).await;

        match &join_result {
            Ok(()) if kind == ActiveIngestionKind::Live && mark_stopped_on_success => {
                update_runtime_if_current(
                    &self.runtime_mode,
                    self.current_run_id.as_ref(),
                    run_id,
                    |snapshot| {
                        snapshot.status = RuntimeModeStatus::Stopped;
                        snapshot.last_error = None;
                    },
                );
            }
            Err(error) => {
                mark_runtime_failed(
                    &self.runtime_mode,
                    self.current_run_id.as_ref(),
                    run_id,
                    error,
                );
            }
            _ => {}
        }

        join_result
    }

    async fn reset_runtime_state_with_status(
        &self,
        policy: RuntimeResetPolicy,
        mark_stopped_on_success: bool,
    ) -> Result<()> {
        let run_id = self.current_run_id.load(Ordering::SeqCst);
        let result = self
            .reset_runtime_state_inner(policy, run_id, mark_stopped_on_success)
            .await;

        if let Err(error) = &result {
            mark_runtime_failed(
                &self.runtime_mode,
                self.current_run_id.as_ref(),
                run_id,
                error,
            );
        }

        result
    }

    fn spawn_replay_task(
        &self,
        settings: IngestionSettings,
        run_id: u64,
        reset_storage_before_start: bool,
    ) -> ActiveIngestionTask {
        let runtime_mode = self.runtime_mode.clone();
        let current_run_id = self.current_run_id.clone();
        let detector_settings = self.detector_settings.clone();
        let pg_pool = self.pg_pool.clone();
        let redis_cache = self.redis_cache.clone();
        let counters = self.counters.clone();

        mark_runtime_started(&runtime_mode, current_run_id.as_ref(), run_id);

        let join_handle = tokio::spawn(async move {
            let result = async {
                if reset_storage_before_start {
                    reset_replay_storage_if_needed(&settings, &pg_pool).await?;
                }

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
                    update_runtime_if_current(
                        &runtime_mode,
                        current_run_id.as_ref(),
                        run_id,
                        |snapshot| {
                            snapshot.status = RuntimeModeStatus::Completed;
                            snapshot.last_error = None;
                        },
                    );
                }
                Err(error) => {
                    mark_runtime_failed(&runtime_mode, current_run_id.as_ref(), run_id, error);
                }
            }

            result
        });

        ActiveIngestionTask {
            run_id,
            kind: ActiveIngestionKind::Replay,
            join_handle,
            shutdown_tx: None,
        }
    }

    fn spawn_live_task(&self, settings: IngestionSettings, run_id: u64) -> ActiveIngestionTask {
        let runtime_mode = self.runtime_mode.clone();
        let current_run_id = self.current_run_id.clone();
        let binance_settings = self.binance_settings.clone();
        let detector_settings = self.detector_settings.clone();
        let pg_pool = self.pg_pool.clone();
        let redis_cache = self.redis_cache.clone();
        let counters = self.counters.clone();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        mark_runtime_started(&runtime_mode, current_run_id.as_ref(), run_id);

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
                mark_runtime_failed(&runtime_mode, current_run_id.as_ref(), run_id, error);
            }

            result
        });

        ActiveIngestionTask {
            run_id,
            kind: ActiveIngestionKind::Live,
            join_handle,
            shutdown_tx: Some(shutdown_tx),
        }
    }

    fn resolve_switch_request(
        &self,
        command: RuntimeModeSwitchCommand,
    ) -> std::result::Result<ResolvedSwitchRequest, SwitchModeError> {
        let mode = match command.mode.as_str() {
            "replay" => IngestionMode::Replay,
            "live" => IngestionMode::Live,
            _ => {
                return Err(SwitchModeError::Validation(format!(
                    "runtime mode must be `replay` or `live`: {}",
                    command.mode
                )));
            }
        };

        let symbols = match command.symbols {
            Some(symbols) => parse_symbols(symbols)?,
            None => self.ingestion_settings.symbols.clone(),
        };

        if mode == IngestionMode::Live && symbols.is_empty() {
            return Err(SwitchModeError::Validation(String::from(
                "live mode requires at least one symbol",
            )));
        }

        Ok(ResolvedSwitchRequest {
            mode,
            symbols,
            reset_policy: RuntimeResetPolicy::from_optional_flags(
                command.reset_state,
                command.reset_storage,
            ),
        })
    }

    fn settings_for_mode(&self, mode: IngestionMode, symbols: Vec<Symbol>) -> IngestionSettings {
        let mut settings = self.ingestion_settings.clone();
        settings.mode = mode;
        settings.symbols = symbols;
        settings
    }

    fn next_run_id(&self) -> u64 {
        self.next_run_id.fetch_add(1, Ordering::SeqCst)
    }

    async fn reset_runtime_state_inner(
        &self,
        policy: RuntimeResetPolicy,
        run_id: u64,
        mark_stopped_on_success: bool,
    ) -> Result<()> {
        if policy.reset_state {
            self.redis_cache
                .clear_market_state_cache()
                .await
                .context("failed to clear runtime market state cache")?;
        }

        if policy.reset_storage {
            reset_demo_storage(&self.pg_pool).await?;
        }

        if (policy.reset_state || policy.reset_storage) && mark_stopped_on_success {
            update_runtime_if_current(
                &self.runtime_mode,
                self.current_run_id.as_ref(),
                run_id,
                |snapshot| {
                    snapshot.status = RuntimeModeStatus::Stopped;
                    snapshot.last_error = None;
                },
            );
        }

        Ok(())
    }
}

fn parse_symbols(raw_symbols: Vec<String>) -> std::result::Result<Vec<Symbol>, SwitchModeError> {
    if raw_symbols.is_empty() {
        return Err(SwitchModeError::Validation(String::from(
            "symbols must contain at least one symbol",
        )));
    }

    raw_symbols
        .into_iter()
        .map(|raw_symbol| {
            Symbol::new(raw_symbol.clone()).map_err(|error| {
                SwitchModeError::Validation(format!(
                    "invalid runtime symbol `{raw_symbol}`: {error}"
                ))
            })
        })
        .collect()
}

fn mark_runtime_started(runtime_mode: &RuntimeModeHandle, current_run_id: &AtomicU64, run_id: u64) {
    let started_at = Utc::now();
    update_runtime_if_current(runtime_mode, current_run_id, run_id, |snapshot| {
        snapshot.status = RuntimeModeStatus::Running;
        snapshot.last_started_at = started_at;
        snapshot.last_error = None;
    });
}

fn mark_runtime_failed(
    runtime_mode: &RuntimeModeHandle,
    current_run_id: &AtomicU64,
    run_id: u64,
    error: &anyhow::Error,
) {
    update_runtime_if_current(runtime_mode, current_run_id, run_id, |snapshot| {
        snapshot.status = RuntimeModeStatus::Failed;
        snapshot.last_error = Some(error.to_string());
    });
}

fn update_runtime_if_current(
    runtime_mode: &RuntimeModeHandle,
    current_run_id: &AtomicU64,
    run_id: u64,
    update: impl FnOnce(&mut RuntimeModeSnapshot),
) {
    if current_run_id.load(Ordering::SeqCst) != run_id {
        return;
    }

    runtime_mode.update(update);
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
        reset_demo_storage(postgres_pool).await?;
    }

    Ok(())
}

async fn reset_demo_storage(postgres_pool: &PgPool) -> Result<()> {
    storage::postgres::reset_replay_storage(postgres_pool)
        .await
        .context("failed to reset replay historical tables")
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use chrono::Utc;
    use rust_decimal::Decimal;
    use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

    use super::{IngestionSupervisor, RuntimeModeSwitchCommand, SwitchModeError};
    use crate::{
        config::{BinanceSettings, DetectorSettings, IngestionMode, IngestionSettings},
        domain::Symbol,
        runtime::{RuntimeModeSource, RuntimeModeStatus, RuntimeResetPolicy},
        storage::RedisCache,
        telemetry::InternalCounters,
    };

    #[tokio::test]
    async fn supervisor_initializes_runtime_snapshot_from_operator_gate() {
        let disabled = test_supervisor(IngestionMode::Replay, false)
            .runtime_mode_handle()
            .snapshot();
        let enabled = test_supervisor(IngestionMode::Replay, true)
            .runtime_mode_handle()
            .snapshot();

        assert_eq!(disabled.mode.as_str(), "replay");
        assert_eq!(disabled.status, RuntimeModeStatus::Running);
        assert_eq!(disabled.symbols.len(), 1);
        assert!(!disabled.switching_supported);
        assert!(enabled.switching_supported);
    }

    #[tokio::test]
    async fn replay_completion_sets_runtime_status_to_completed() {
        let supervisor = test_supervisor(IngestionMode::Replay, true);

        supervisor.start_initial().await.unwrap();
        supervisor.shutdown_active_ingestion().await.unwrap();

        assert_eq!(
            supervisor.runtime_mode_handle().snapshot().status,
            RuntimeModeStatus::Completed
        );
    }

    #[tokio::test]
    async fn shutdown_active_ingestion_is_safe_when_nothing_is_running() {
        let supervisor = test_supervisor(IngestionMode::Replay, true);

        supervisor.shutdown_active_ingestion().await.unwrap();

        assert_eq!(
            supervisor.runtime_mode_handle().snapshot().status,
            RuntimeModeStatus::Running
        );
    }

    #[tokio::test]
    async fn concurrent_switch_attempt_returns_conflict() {
        let supervisor = test_supervisor(IngestionMode::Replay, true);
        let _guard = supervisor.switch_guard.lock().await;

        let error = supervisor
            .switch_mode(RuntimeModeSwitchCommand {
                mode: String::from("replay"),
                symbols: None,
                reset_state: Some(false),
                reset_storage: Some(false),
            })
            .await
            .unwrap_err();

        assert!(matches!(error, SwitchModeError::Conflict));
    }

    #[tokio::test]
    async fn switch_mode_updates_snapshot_to_runtime_source() {
        let supervisor = test_supervisor(IngestionMode::Replay, true);

        let snapshot = supervisor
            .switch_mode(RuntimeModeSwitchCommand {
                mode: String::from("replay"),
                symbols: Some(vec![String::from("ethusdt"), String::from("solusdt")]),
                reset_state: Some(false),
                reset_storage: Some(false),
            })
            .await
            .unwrap();
        supervisor.shutdown_active_ingestion().await.unwrap();

        assert_eq!(snapshot.mode.as_str(), "replay");
        assert_eq!(snapshot.source, RuntimeModeSource::Runtime);
        assert!(snapshot.switching_supported);
        assert_eq!(
            snapshot.symbols,
            vec![
                Symbol::new("ETHUSDT").unwrap(),
                Symbol::new("SOLUSDT").unwrap()
            ]
        );
        assert!(matches!(
            snapshot.status,
            RuntimeModeStatus::Running | RuntimeModeStatus::Completed
        ));
        assert!(snapshot.last_switched_at.is_some());
        assert_eq!(snapshot.last_error, None);
    }

    #[tokio::test]
    async fn successful_switch_preserves_disabled_operator_gate() {
        let supervisor = test_supervisor(IngestionMode::Replay, false);

        let snapshot = supervisor
            .switch_mode(RuntimeModeSwitchCommand {
                mode: String::from("replay"),
                symbols: Some(vec![String::from("BTCUSDT")]),
                reset_state: None,
                reset_storage: None,
            })
            .await
            .unwrap();
        supervisor.shutdown_active_ingestion().await.unwrap();

        assert!(!snapshot.switching_supported);
        assert!(
            !supervisor
                .runtime_mode_handle()
                .snapshot()
                .switching_supported
        );
    }

    #[tokio::test]
    async fn failed_switch_preserves_disabled_operator_gate() {
        let supervisor = test_supervisor(IngestionMode::Replay, false);

        let error = supervisor
            .switch_mode(RuntimeModeSwitchCommand {
                mode: String::from("replay"),
                symbols: Some(vec![String::from("BTCUSDT")]),
                reset_state: None,
                reset_storage: Some(true),
            })
            .await
            .unwrap_err();

        assert!(matches!(error, SwitchModeError::Execution(_)));
        let snapshot = supervisor.runtime_mode_handle().snapshot();
        assert_eq!(snapshot.status, RuntimeModeStatus::Failed);
        assert!(!snapshot.switching_supported);
    }

    #[tokio::test]
    async fn no_op_reset_policy_preserves_cache_and_runtime_status() {
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let cache = RedisCache::in_memory(vec![crate::domain::MarketState::new(symbol.clone())]);
        let supervisor = test_supervisor_with_cache(IngestionMode::Replay, false, cache.clone());

        supervisor
            .reset_runtime_state(RuntimeResetPolicy::non_destructive())
            .await
            .unwrap();

        assert!(cache.get_market_state(&symbol).await.unwrap().is_some());
        let snapshot = supervisor.runtime_mode_handle().snapshot();
        assert_eq!(snapshot.status, RuntimeModeStatus::Running);
        assert!(!snapshot.switching_supported);
    }

    #[tokio::test]
    async fn reset_runtime_state_clears_in_memory_redis_state_when_requested() {
        let cache = RedisCache::in_memory(vec![crate::domain::MarketState::new(
            Symbol::new("BTCUSDT").unwrap(),
        )]);
        let supervisor = IngestionSupervisor::new(
            &IngestionSettings {
                mode: IngestionMode::Replay,
                symbols: vec![Symbol::new("BTCUSDT").unwrap()],
                replay_path: PathBuf::from("examples/replay/sample.jsonl"),
                replay_delay_ms: 0,
                replay_reset_state: true,
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
            false,
            unused_test_pool(),
            cache.clone(),
            InternalCounters::default(),
        );

        supervisor
            .reset_runtime_state(RuntimeResetPolicy {
                reset_state: true,
                reset_storage: false,
            })
            .await
            .unwrap();

        assert!(cache.list_symbols().await.unwrap().is_empty());
        assert_eq!(
            supervisor.runtime_mode_handle().snapshot().status,
            RuntimeModeStatus::Stopped
        );
    }

    #[tokio::test]
    async fn reset_runtime_state_marks_runtime_failed_when_storage_reset_fails() {
        let supervisor = test_supervisor(IngestionMode::Replay, true);

        let error = supervisor
            .reset_runtime_state(RuntimeResetPolicy {
                reset_state: false,
                reset_storage: true,
            })
            .await
            .unwrap_err();

        assert!(
            error
                .to_string()
                .contains("failed to reset replay historical tables")
        );
        assert_eq!(
            supervisor.runtime_mode_handle().snapshot().status,
            RuntimeModeStatus::Failed
        );
    }

    fn test_supervisor(mode: IngestionMode, switching_supported: bool) -> IngestionSupervisor {
        test_supervisor_with_cache(mode, switching_supported, RedisCache::in_memory(Vec::new()))
    }

    fn test_supervisor_with_cache(
        mode: IngestionMode,
        switching_supported: bool,
        redis_cache: RedisCache,
    ) -> IngestionSupervisor {
        IngestionSupervisor::new(
            &IngestionSettings {
                mode,
                symbols: vec![Symbol::new("BTCUSDT").unwrap()],
                replay_path: PathBuf::from("examples/replay/sample.jsonl"),
                replay_delay_ms: 0,
                replay_reset_state: true,
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
            switching_supported,
            unused_test_pool(),
            redis_cache,
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

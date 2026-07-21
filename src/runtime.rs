use std::sync::{Arc, RwLock, RwLockReadGuard, RwLockWriteGuard};

use chrono::{DateTime, Utc};

use crate::{config::IngestionMode, domain::Symbol};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeMode {
    Replay,
    Live,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeModeStatus {
    Starting,
    Running,
    Switching,
    Failed,
    Stopped,
    Completed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeModeSource {
    Config,
    Runtime,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuntimeModeSnapshot {
    pub mode: RuntimeMode,
    pub status: RuntimeModeStatus,
    pub symbols: Vec<Symbol>,
    pub switching_supported: bool,
    pub source: RuntimeModeSource,
    pub last_started_at: DateTime<Utc>,
    pub last_switched_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct RuntimeResetPolicy {
    pub reset_state: bool,
    pub reset_storage: bool,
}

#[derive(Clone, Debug)]
pub struct RuntimeModeHandle {
    inner: Arc<RwLock<RuntimeModeSnapshot>>,
}

impl RuntimeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Replay => "replay",
            Self::Live => "live",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Replay => "Replay Demo",
            Self::Live => "Public Demo",
        }
    }
}

impl RuntimeModeStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Starting => "starting",
            Self::Running => "running",
            Self::Switching => "switching",
            Self::Failed => "failed",
            Self::Stopped => "stopped",
            Self::Completed => "completed",
        }
    }
}

impl RuntimeModeSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Config => "config",
            Self::Runtime => "runtime",
        }
    }
}

impl RuntimeModeSnapshot {
    pub fn from_startup_config(
        mode: IngestionMode,
        symbols: &[Symbol],
        started_at: DateTime<Utc>,
        switching_supported: bool,
    ) -> Self {
        Self {
            mode: RuntimeMode::from(mode),
            status: RuntimeModeStatus::Running,
            symbols: symbols.to_vec(),
            switching_supported,
            source: RuntimeModeSource::Config,
            last_started_at: started_at,
            last_switched_at: None,
            last_error: None,
        }
    }
}

impl RuntimeResetPolicy {
    pub const fn from_optional_flags(
        reset_state: Option<bool>,
        reset_storage: Option<bool>,
    ) -> Self {
        Self {
            reset_state: matches!(reset_state, Some(true)),
            reset_storage: matches!(reset_storage, Some(true)),
        }
    }

    pub const fn non_destructive() -> Self {
        Self {
            reset_state: false,
            reset_storage: false,
        }
    }

    pub const fn is_noop(self) -> bool {
        !self.reset_state && !self.reset_storage
    }
}

impl RuntimeModeHandle {
    pub fn new(snapshot: RuntimeModeSnapshot) -> Self {
        Self {
            inner: Arc::new(RwLock::new(snapshot)),
        }
    }

    pub fn snapshot(&self) -> RuntimeModeSnapshot {
        self.read_guard().clone()
    }

    pub fn update(&self, update: impl FnOnce(&mut RuntimeModeSnapshot)) {
        update(&mut self.write_guard());
    }

    fn read_guard(&self) -> RwLockReadGuard<'_, RuntimeModeSnapshot> {
        self.inner.read().unwrap_or_else(|error| error.into_inner())
    }

    fn write_guard(&self) -> RwLockWriteGuard<'_, RuntimeModeSnapshot> {
        self.inner
            .write()
            .unwrap_or_else(|error| error.into_inner())
    }
}

impl From<IngestionMode> for RuntimeMode {
    fn from(value: IngestionMode) -> Self {
        match value {
            IngestionMode::Replay => Self::Replay,
            IngestionMode::Live => Self::Live,
        }
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::{
        RuntimeModeHandle, RuntimeModeSnapshot, RuntimeModeSource, RuntimeModeStatus,
        RuntimeResetPolicy,
    };
    use crate::{config::IngestionMode, domain::Symbol};

    #[test]
    fn startup_snapshot_uses_configured_mode_symbols_and_operator_gate() {
        let started_at = chrono::Utc.with_ymd_and_hms(2026, 7, 2, 12, 0, 0).unwrap();
        let symbols = vec![
            Symbol::new("BTCUSDT").unwrap(),
            Symbol::new("ETHUSDT").unwrap(),
        ];

        let disabled = RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &symbols,
            started_at,
            false,
        );
        let enabled = RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &symbols,
            started_at,
            true,
        );

        assert_eq!(disabled.mode.as_str(), "replay");
        assert_eq!(disabled.mode.label(), "Replay Demo");
        assert_eq!(disabled.status, RuntimeModeStatus::Running);
        assert_eq!(disabled.source, RuntimeModeSource::Config);
        assert_eq!(disabled.symbols, symbols);
        assert!(!disabled.switching_supported);
        assert!(enabled.switching_supported);
        assert_eq!(disabled.last_started_at, started_at);
        assert_eq!(disabled.last_switched_at, None);
        assert_eq!(disabled.last_error, None);
    }

    #[test]
    fn runtime_mode_handle_supports_snapshot_reads_and_updates() {
        let started_at = chrono::Utc.with_ymd_and_hms(2026, 7, 2, 12, 0, 0).unwrap();
        let handle = RuntimeModeHandle::new(RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &[Symbol::new("BTCUSDT").unwrap()],
            started_at,
            false,
        ));

        handle.update(|snapshot| {
            snapshot.status = RuntimeModeStatus::Completed;
            snapshot.last_error = Some(String::from("done"));
        });

        let snapshot = handle.snapshot();
        assert_eq!(snapshot.status, RuntimeModeStatus::Completed);
        assert_eq!(snapshot.last_error.as_deref(), Some("done"));
        assert!(!snapshot.switching_supported);
    }

    #[test]
    fn optional_reset_flags_are_non_destructive_when_omitted_or_false() {
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(None, None),
            RuntimeResetPolicy::non_destructive()
        );
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(Some(false), Some(false)),
            RuntimeResetPolicy::non_destructive()
        );
    }

    #[test]
    fn optional_reset_flags_preserve_independent_explicit_requests() {
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(Some(true), Some(false)),
            RuntimeResetPolicy {
                reset_state: true,
                reset_storage: false,
            }
        );
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(Some(false), Some(true)),
            RuntimeResetPolicy {
                reset_state: false,
                reset_storage: true,
            }
        );
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(Some(true), Some(true)),
            RuntimeResetPolicy {
                reset_state: true,
                reset_storage: true,
            }
        );
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(None, Some(true)),
            RuntimeResetPolicy {
                reset_state: false,
                reset_storage: true,
            }
        );
        assert_eq!(
            RuntimeResetPolicy::from_optional_flags(Some(true), None),
            RuntimeResetPolicy {
                reset_state: true,
                reset_storage: false,
            }
        );
    }

    #[test]
    fn non_destructive_policy_is_a_noop() {
        assert!(RuntimeResetPolicy::non_destructive().is_noop());
        assert!(
            !RuntimeResetPolicy {
                reset_state: true,
                reset_storage: false,
            }
            .is_noop()
        );
    }
}

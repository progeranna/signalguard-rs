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
    ) -> Self {
        Self {
            mode: RuntimeMode::from(mode),
            status: RuntimeModeStatus::Running,
            symbols: symbols.to_vec(),
            switching_supported: false,
            source: RuntimeModeSource::Config,
            last_started_at: started_at,
            last_switched_at: None,
            last_error: None,
        }
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

    use super::{RuntimeModeHandle, RuntimeModeSnapshot, RuntimeModeSource, RuntimeModeStatus};
    use crate::{config::IngestionMode, domain::Symbol};

    #[test]
    fn startup_snapshot_uses_configured_mode_and_symbols() {
        let started_at = chrono::Utc.with_ymd_and_hms(2026, 7, 2, 12, 0, 0).unwrap();
        let symbols = vec![
            Symbol::new("BTCUSDT").unwrap(),
            Symbol::new("ETHUSDT").unwrap(),
        ];

        let snapshot =
            RuntimeModeSnapshot::from_startup_config(IngestionMode::Replay, &symbols, started_at);

        assert_eq!(snapshot.mode.as_str(), "replay");
        assert_eq!(snapshot.mode.label(), "Replay Demo");
        assert_eq!(snapshot.status, RuntimeModeStatus::Running);
        assert_eq!(snapshot.source, RuntimeModeSource::Config);
        assert_eq!(snapshot.symbols, symbols);
        assert!(!snapshot.switching_supported);
        assert_eq!(snapshot.last_started_at, started_at);
        assert_eq!(snapshot.last_switched_at, None);
        assert_eq!(snapshot.last_error, None);
    }

    #[test]
    fn runtime_mode_handle_supports_snapshot_reads_and_updates() {
        let started_at = chrono::Utc.with_ymd_and_hms(2026, 7, 2, 12, 0, 0).unwrap();
        let handle = RuntimeModeHandle::new(RuntimeModeSnapshot::from_startup_config(
            IngestionMode::Replay,
            &[Symbol::new("BTCUSDT").unwrap()],
            started_at,
        ));

        handle.update(|snapshot| {
            snapshot.status = RuntimeModeStatus::Completed;
            snapshot.last_error = Some(String::from("done"));
        });

        let snapshot = handle.snapshot();
        assert_eq!(snapshot.status, RuntimeModeStatus::Completed);
        assert_eq!(snapshot.last_error.as_deref(), Some("done"));
    }
}

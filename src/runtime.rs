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

    use super::{RuntimeModeSnapshot, RuntimeModeSource, RuntimeModeStatus};
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
}

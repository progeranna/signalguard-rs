use std::{
    collections::HashMap,
    env,
    net::{SocketAddr, ToSocketAddrs},
    path::PathBuf,
};

use crate::domain::{HealthStatus, Symbol};
use anyhow::{Context, Result, anyhow, bail};
use rust_decimal::Decimal;

const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 8080;
const DEFAULT_DATABASE_URL: &str = "postgres://signalguard:signalguard@127.0.0.1:5432/signalguard";
const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379";
const DEFAULT_REPLAY_PATH: &str = "examples/replay/sample.jsonl";
const DEFAULT_REPLAY_RESET_STORAGE: bool = true;
const DEFAULT_BINANCE_WEBSOCKET_BASE_URL: &str = "wss://stream.binance.com:9443";
const DEFAULT_SYMBOLS: &[&str] = &["BTCUSDT"];
const DEFAULT_BINANCE_RECONNECT_MIN_BACKOFF_MS: u64 = 500;
const DEFAULT_BINANCE_RECONNECT_MAX_BACKOFF_MS: u64 = 5_000;
const DEFAULT_PRICE_MOVE_1M_PCT_THRESHOLD: &str = "2.5";
const DEFAULT_SPREAD_SPIKE_PCT_THRESHOLD: &str = "0.5";
const DEFAULT_TRADE_BURST_MULTIPLIER: &str = "3.0";
const DEFAULT_STALE_DATA_MS_THRESHOLD: u64 = 5_000;
const DEFAULT_TRADE_BURST_MIN_WARMUP_WINDOWS: u32 = 5;
const DEFAULT_HEALTH_BASE_SCORE: u8 = 100;
const DEFAULT_HEALTH_INFO_PENALTY: u8 = 5;
const DEFAULT_HEALTH_WARNING_PENALTY: u8 = 15;
const DEFAULT_HEALTH_CRITICAL_PENALTY: u8 = 35;
const DEFAULT_HEALTH_STALE_DATA_PENALTY: u8 = 25;
const DEFAULT_HEALTH_RECENT_ANOMALY_WINDOW_SECS: u64 = 300;
const DEFAULT_HEALTHY_MIN_SCORE: u8 = 80;
const DEFAULT_DEGRADED_MIN_SCORE: u8 = 50;

#[derive(Debug)]
pub struct Settings {
    pub server: ServerSettings,
    pub database: DatabaseSettings,
    pub redis: RedisSettings,
    pub ingestion: IngestionSettings,
    pub binance: BinanceSettings,
    pub detectors: DetectorSettings,
    pub health: HealthScoreSettings,
}

#[derive(Debug)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
}

#[derive(Debug)]
pub struct DatabaseSettings {
    pub url: String,
}

#[derive(Debug)]
pub struct RedisSettings {
    pub url: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IngestionMode {
    Replay,
    Live,
}

#[derive(Clone, Debug)]
pub struct IngestionSettings {
    pub mode: IngestionMode,
    pub symbols: Vec<Symbol>,
    pub replay_path: PathBuf,
    pub replay_delay_ms: u64,
    pub replay_reset_storage: bool,
}

#[derive(Clone, Debug)]
pub struct BinanceSettings {
    pub websocket_base_url: String,
    pub reconnect_min_backoff_ms: u64,
    pub reconnect_max_backoff_ms: u64,
}

#[derive(Clone, Debug)]
pub struct DetectorSettings {
    pub price_move_1m_pct_threshold: Decimal,
    pub spread_spike_pct_threshold: Decimal,
    pub stale_data_ms_threshold: u64,
    pub trade_burst_multiplier: Decimal,
    pub trade_burst_min_warmup_windows: u32,
}

#[derive(Clone, Debug)]
pub struct HealthScoreSettings {
    pub base_score: u8,
    pub severity_penalties: SeverityPenaltySettings,
    pub stale_data_penalty: u8,
    pub recent_anomaly_window_secs: u64,
    pub status_thresholds: HealthStatusThresholds,
}

#[derive(Clone, Debug)]
pub struct SeverityPenaltySettings {
    pub info: u8,
    pub warning: u8,
    pub critical: u8,
}

#[derive(Clone, Debug)]
pub struct HealthStatusThresholds {
    pub healthy_min_score: u8,
    pub degraded_min_score: u8,
}

impl Settings {
    pub fn load() -> Result<Self> {
        dotenvy::dotenv().ok();

        let env_map = env::vars().collect::<HashMap<_, _>>();
        Self::load_from_map(&env_map)
    }

    fn load_from_map(env_map: &HashMap<String, String>) -> Result<Self> {
        let host =
            env_value(env_map, "SIGNALGUARD_HOST").unwrap_or_else(|| DEFAULT_HOST.to_owned());
        let port = env_value(env_map, "SIGNALGUARD_PORT")
            .map(parse_port)
            .unwrap_or(Ok(DEFAULT_PORT))?;
        let database_url = env_value(env_map, "SIGNALGUARD_DATABASE_URL")
            .unwrap_or_else(|| DEFAULT_DATABASE_URL.to_owned());
        let redis_url = env_value(env_map, "SIGNALGUARD_REDIS_URL")
            .unwrap_or_else(|| DEFAULT_REDIS_URL.to_owned());
        let mode = env_value(env_map, "SIGNALGUARD_INGESTION_MODE")
            .map(parse_ingestion_mode)
            .unwrap_or(Ok(IngestionMode::Replay))?;
        let symbols = env_value(env_map, "SIGNALGUARD_INGESTION_SYMBOLS")
            .map(parse_symbols)
            .unwrap_or_else(default_symbols)?;
        let replay_path = env_value(env_map, "SIGNALGUARD_INGESTION_REPLAY_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(DEFAULT_REPLAY_PATH));
        let replay_delay_ms = env_u64(env_map, "SIGNALGUARD_INGESTION_REPLAY_DELAY_MS", 0)?;
        let replay_reset_storage = env_bool(
            env_map,
            "SIGNALGUARD_REPLAY_RESET_STORAGE",
            DEFAULT_REPLAY_RESET_STORAGE,
        )?;
        let binance = BinanceSettings {
            websocket_base_url: env_value(env_map, "SIGNALGUARD_BINANCE_WEBSOCKET_BASE_URL")
                .unwrap_or_else(|| DEFAULT_BINANCE_WEBSOCKET_BASE_URL.to_owned()),
            reconnect_min_backoff_ms: env_u64(
                env_map,
                "SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS",
                DEFAULT_BINANCE_RECONNECT_MIN_BACKOFF_MS,
            )?,
            reconnect_max_backoff_ms: env_u64(
                env_map,
                "SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS",
                DEFAULT_BINANCE_RECONNECT_MAX_BACKOFF_MS,
            )?,
        };
        binance.validate()?;

        let detectors = DetectorSettings {
            price_move_1m_pct_threshold: env_decimal(
                env_map,
                "SIGNALGUARD_DETECTORS_PRICE_MOVE_1M_PCT_THRESHOLD",
                DEFAULT_PRICE_MOVE_1M_PCT_THRESHOLD,
            )?,
            spread_spike_pct_threshold: env_decimal(
                env_map,
                "SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD",
                DEFAULT_SPREAD_SPIKE_PCT_THRESHOLD,
            )?,
            stale_data_ms_threshold: env_u64(
                env_map,
                "SIGNALGUARD_DETECTORS_STALE_DATA_MS_THRESHOLD",
                DEFAULT_STALE_DATA_MS_THRESHOLD,
            )?,
            trade_burst_multiplier: env_decimal(
                env_map,
                "SIGNALGUARD_DETECTORS_TRADE_BURST_MULTIPLIER",
                DEFAULT_TRADE_BURST_MULTIPLIER,
            )?,
            trade_burst_min_warmup_windows: env_u32(
                env_map,
                "SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS",
                DEFAULT_TRADE_BURST_MIN_WARMUP_WINDOWS,
            )?,
        };
        detectors.validate()?;

        let health = HealthScoreSettings {
            base_score: env_u8(
                env_map,
                "SIGNALGUARD_HEALTH_BASE_SCORE",
                DEFAULT_HEALTH_BASE_SCORE,
            )?,
            severity_penalties: SeverityPenaltySettings {
                info: env_u8(
                    env_map,
                    "SIGNALGUARD_HEALTH_INFO_PENALTY",
                    DEFAULT_HEALTH_INFO_PENALTY,
                )?,
                warning: env_u8(
                    env_map,
                    "SIGNALGUARD_HEALTH_WARNING_PENALTY",
                    DEFAULT_HEALTH_WARNING_PENALTY,
                )?,
                critical: env_u8(
                    env_map,
                    "SIGNALGUARD_HEALTH_CRITICAL_PENALTY",
                    DEFAULT_HEALTH_CRITICAL_PENALTY,
                )?,
            },
            stale_data_penalty: env_u8(
                env_map,
                "SIGNALGUARD_HEALTH_STALE_DATA_PENALTY",
                DEFAULT_HEALTH_STALE_DATA_PENALTY,
            )?,
            recent_anomaly_window_secs: env_u64(
                env_map,
                "SIGNALGUARD_HEALTH_RECENT_ANOMALY_WINDOW_SECS",
                DEFAULT_HEALTH_RECENT_ANOMALY_WINDOW_SECS,
            )?,
            status_thresholds: HealthStatusThresholds {
                healthy_min_score: env_u8(
                    env_map,
                    "SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE",
                    DEFAULT_HEALTHY_MIN_SCORE,
                )?,
                degraded_min_score: env_u8(
                    env_map,
                    "SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE",
                    DEFAULT_DEGRADED_MIN_SCORE,
                )?,
            },
        };
        health.validate()?;

        Ok(Self {
            server: ServerSettings { host, port },
            database: DatabaseSettings { url: database_url },
            redis: RedisSettings { url: redis_url },
            ingestion: IngestionSettings {
                mode,
                symbols,
                replay_path,
                replay_delay_ms,
                replay_reset_storage,
            },
            binance,
            detectors,
            health,
        })
    }
}

impl ServerSettings {
    pub fn socket_address(&self) -> Result<SocketAddr> {
        let address = format!("{}:{}", self.host, self.port);
        address
            .to_socket_addrs()
            .with_context(|| format!("invalid server address: {address}"))?
            .next()
            .ok_or_else(|| anyhow!("server address did not resolve: {address}"))
    }
}

impl IngestionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Replay => "replay",
            Self::Live => "live",
        }
    }
}

impl BinanceSettings {
    fn validate(&self) -> Result<()> {
        if self.websocket_base_url.trim().is_empty() {
            bail!("SIGNALGUARD_BINANCE_WEBSOCKET_BASE_URL must not be empty");
        }
        if self.reconnect_min_backoff_ms == 0 {
            bail!("SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS must be greater than zero");
        }
        if self.reconnect_max_backoff_ms < self.reconnect_min_backoff_ms {
            bail!(
                "SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS must be greater than or equal to SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS"
            );
        }

        Ok(())
    }
}

impl DetectorSettings {
    fn validate(&self) -> Result<()> {
        validate_positive_decimal(
            "SIGNALGUARD_DETECTORS_PRICE_MOVE_1M_PCT_THRESHOLD",
            self.price_move_1m_pct_threshold,
        )?;
        validate_positive_decimal(
            "SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD",
            self.spread_spike_pct_threshold,
        )?;
        if self.stale_data_ms_threshold == 0 {
            bail!("SIGNALGUARD_DETECTORS_STALE_DATA_MS_THRESHOLD must be greater than zero");
        }
        validate_positive_decimal(
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MULTIPLIER",
            self.trade_burst_multiplier,
        )?;
        if self.trade_burst_min_warmup_windows == 0 {
            bail!("SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS must be greater than zero");
        }

        Ok(())
    }
}

impl HealthScoreSettings {
    fn validate(&self) -> Result<()> {
        self.severity_penalties.validate()?;
        self.status_thresholds.validate()?;

        validate_score("SIGNALGUARD_HEALTH_BASE_SCORE", self.base_score)?;
        validate_score(
            "SIGNALGUARD_HEALTH_STALE_DATA_PENALTY",
            self.stale_data_penalty,
        )?;
        if self.recent_anomaly_window_secs == 0 {
            bail!("SIGNALGUARD_HEALTH_RECENT_ANOMALY_WINDOW_SECS must be greater than zero");
        }
        if self.base_score < self.status_thresholds.healthy_min_score {
            bail!(
                "SIGNALGUARD_HEALTH_BASE_SCORE must be greater than or equal to SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE"
            );
        }

        Ok(())
    }
}

impl SeverityPenaltySettings {
    fn validate(&self) -> Result<()> {
        validate_score("SIGNALGUARD_HEALTH_INFO_PENALTY", self.info)?;
        validate_score("SIGNALGUARD_HEALTH_WARNING_PENALTY", self.warning)?;
        validate_score("SIGNALGUARD_HEALTH_CRITICAL_PENALTY", self.critical)?;
        if self.info > self.warning || self.warning > self.critical {
            bail!("health severity penalties must be ordered info <= warning <= critical");
        }

        Ok(())
    }
}

impl HealthStatusThresholds {
    fn validate(&self) -> Result<()> {
        validate_score(
            "SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE",
            self.healthy_min_score,
        )?;
        validate_score(
            "SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE",
            self.degraded_min_score,
        )?;
        if self.degraded_min_score >= self.healthy_min_score {
            bail!(
                "SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE must be less than SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE"
            );
        }

        Ok(())
    }

    pub fn classify(&self, score: u8) -> HealthStatus {
        if score >= self.healthy_min_score {
            HealthStatus::Healthy
        } else if score >= self.degraded_min_score {
            HealthStatus::Degraded
        } else {
            HealthStatus::Unhealthy
        }
    }
}

fn env_value(env_map: &HashMap<String, String>, key: &str) -> Option<String> {
    env_map.get(key).cloned()
}

fn parse_port(value: String) -> Result<u16> {
    value
        .parse()
        .with_context(|| format!("SIGNALGUARD_PORT must be a valid port: {value}"))
}

fn parse_ingestion_mode(value: String) -> Result<IngestionMode> {
    match value.as_str() {
        "replay" => Ok(IngestionMode::Replay),
        "live" => Ok(IngestionMode::Live),
        _ => bail!("SIGNALGUARD_INGESTION_MODE must be 'replay' or 'live': {value}"),
    }
}

fn default_symbols() -> Result<Vec<Symbol>> {
    DEFAULT_SYMBOLS
        .iter()
        .map(|symbol| {
            Symbol::new(*symbol)
                .with_context(|| format!("built-in default symbol is invalid: {symbol}"))
        })
        .collect()
}

fn parse_symbols(value: String) -> Result<Vec<Symbol>> {
    let raw_symbols = value
        .split(',')
        .map(str::trim)
        .filter(|symbol| !symbol.is_empty())
        .collect::<Vec<_>>();

    if raw_symbols.is_empty() {
        bail!("SIGNALGUARD_INGESTION_SYMBOLS must contain at least one symbol");
    }

    raw_symbols
        .into_iter()
        .map(|raw_symbol| {
            Symbol::new(raw_symbol).with_context(|| {
                format!("SIGNALGUARD_INGESTION_SYMBOLS contains an invalid symbol: {raw_symbol}")
            })
        })
        .collect()
}

fn env_decimal(env_map: &HashMap<String, String>, key: &str, default: &str) -> Result<Decimal> {
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_owned());
    raw_value
        .parse::<Decimal>()
        .with_context(|| format!("{key} must be a valid decimal value: {raw_value}"))
}

fn env_u64(env_map: &HashMap<String, String>, key: &str, default: u64) -> Result<u64> {
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_string());
    raw_value
        .parse::<u64>()
        .with_context(|| format!("{key} must be a valid integer value: {raw_value}"))
}

fn env_u32(env_map: &HashMap<String, String>, key: &str, default: u32) -> Result<u32> {
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_string());
    raw_value
        .parse::<u32>()
        .with_context(|| format!("{key} must be a valid integer value: {raw_value}"))
}

fn env_u8(env_map: &HashMap<String, String>, key: &str, default: u8) -> Result<u8> {
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_string());
    raw_value.parse::<u8>().with_context(|| {
        format!("{key} must be a valid integer value between 0 and 255: {raw_value}")
    })
}

fn env_bool(env_map: &HashMap<String, String>, key: &str, default: bool) -> Result<bool> {
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_string());
    match raw_value.as_str() {
        "true" => Ok(true),
        "false" => Ok(false),
        _ => bail!("{key} must be 'true' or 'false': {raw_value}"),
    }
}

fn validate_positive_decimal(key: &str, value: Decimal) -> Result<()> {
    if value <= Decimal::ZERO {
        bail!("{key} must be greater than zero");
    }

    Ok(())
}

fn validate_score(key: &str, value: u8) -> Result<()> {
    if value > 100 {
        bail!("{key} must be between 0 and 100");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::domain::HealthStatus;

    use super::{IngestionMode, Settings};

    #[test]
    fn settings_use_day_one_defaults() {
        let settings = Settings::load_from_map(&HashMap::new()).unwrap();

        assert_eq!(settings.server.host, "127.0.0.1");
        assert_eq!(settings.server.port, 8080);
        assert_eq!(
            settings.database.url,
            "postgres://signalguard:signalguard@127.0.0.1:5432/signalguard"
        );
        assert_eq!(settings.redis.url, "redis://127.0.0.1:6379");
        assert_eq!(settings.ingestion.mode, IngestionMode::Replay);
        assert_eq!(settings.ingestion.symbols.len(), 1);
        assert_eq!(settings.ingestion.symbols[0].as_str(), "BTCUSDT");
        assert_eq!(
            settings.ingestion.replay_path.as_os_str(),
            "examples/replay/sample.jsonl"
        );
        assert_eq!(settings.ingestion.replay_delay_ms, 0);
        assert!(settings.ingestion.replay_reset_storage);
        assert_eq!(
            settings.binance.websocket_base_url,
            "wss://stream.binance.com:9443"
        );
        assert_eq!(settings.binance.reconnect_min_backoff_ms, 500);
        assert_eq!(settings.binance.reconnect_max_backoff_ms, 5_000);
        assert_eq!(
            settings.detectors.price_move_1m_pct_threshold.to_string(),
            "2.5"
        );
        assert_eq!(
            settings.detectors.spread_spike_pct_threshold.to_string(),
            "0.5"
        );
        assert_eq!(settings.detectors.stale_data_ms_threshold, 5_000);
        assert_eq!(settings.detectors.trade_burst_multiplier.to_string(), "3.0");
        assert_eq!(settings.detectors.trade_burst_min_warmup_windows, 5);
        assert_eq!(settings.health.base_score, 100);
        assert_eq!(settings.health.severity_penalties.info, 5);
        assert_eq!(settings.health.severity_penalties.warning, 15);
        assert_eq!(settings.health.severity_penalties.critical, 35);
        assert_eq!(settings.health.stale_data_penalty, 25);
        assert_eq!(settings.health.recent_anomaly_window_secs, 300);
        assert_eq!(settings.health.status_thresholds.healthy_min_score, 80);
        assert_eq!(settings.health.status_thresholds.degraded_min_score, 50);
    }

    #[test]
    fn invalid_ingestion_mode_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_INGESTION_MODE"),
            String::from("paper"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains("SIGNALGUARD_INGESTION_MODE must be 'replay' or 'live'"));
    }

    #[test]
    fn ingestion_symbols_are_normalized_to_symbols() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_INGESTION_SYMBOLS"),
            String::from("btcusdt, ethusdt"),
        )]);

        let loaded = Settings::load_from_map(&settings).unwrap();

        assert_eq!(loaded.ingestion.symbols[0].as_str(), "BTCUSDT");
        assert_eq!(loaded.ingestion.symbols[1].as_str(), "ETHUSDT");
    }

    #[test]
    fn invalid_ingestion_symbol_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_INGESTION_SYMBOLS"),
            String::from("BTC-USDT"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(
            error.contains("SIGNALGUARD_INGESTION_SYMBOLS contains an invalid symbol: BTC-USDT")
        );
    }

    #[test]
    fn detector_threshold_override_is_loaded() {
        let settings = HashMap::from([
            (
                String::from("SIGNALGUARD_DETECTORS_PRICE_MOVE_1M_PCT_THRESHOLD"),
                String::from("1.25"),
            ),
            (
                String::from("SIGNALGUARD_INGESTION_REPLAY_DELAY_MS"),
                String::from("25"),
            ),
            (
                String::from("SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS"),
                String::from("1000"),
            ),
            (
                String::from("SIGNALGUARD_REPLAY_RESET_STORAGE"),
                String::from("false"),
            ),
        ]);

        let loaded = Settings::load_from_map(&settings).unwrap();

        assert_eq!(
            loaded.detectors.price_move_1m_pct_threshold.to_string(),
            "1.25"
        );
        assert_eq!(loaded.ingestion.replay_delay_ms, 25);
        assert!(!loaded.ingestion.replay_reset_storage);
        assert_eq!(loaded.binance.reconnect_max_backoff_ms, 1_000);
    }

    #[test]
    fn replay_reset_storage_defaults_to_true() {
        let settings = Settings::load_from_map(&HashMap::new()).unwrap();

        assert!(settings.ingestion.replay_reset_storage);
    }

    #[test]
    fn replay_reset_storage_can_be_disabled() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_REPLAY_RESET_STORAGE"),
            String::from("false"),
        )]);

        let loaded = Settings::load_from_map(&settings).unwrap();

        assert!(!loaded.ingestion.replay_reset_storage);
    }

    #[test]
    fn invalid_replay_reset_storage_value_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_REPLAY_RESET_STORAGE"),
            String::from("maybe"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains("SIGNALGUARD_REPLAY_RESET_STORAGE must be 'true' or 'false'"));
    }

    #[test]
    fn invalid_binance_backoff_range_is_rejected() {
        let settings = HashMap::from([
            (
                String::from("SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS"),
                String::from("2000"),
            ),
            (
                String::from("SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS"),
                String::from("1000"),
            ),
        ]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains(
            "SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS must be greater than or equal to SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS"
        ));
    }

    #[test]
    fn invalid_server_address_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_HOST"),
            String::from("invalid host name"),
        )]);

        let loaded = Settings::load_from_map(&settings).unwrap();
        let error = loaded.server.socket_address().unwrap_err().to_string();

        assert!(error.contains("invalid server address"));
    }

    #[test]
    fn invalid_port_is_rejected() {
        let settings =
            HashMap::from([(String::from("SIGNALGUARD_PORT"), String::from("not-a-port"))]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains("SIGNALGUARD_PORT must be a valid port"));
    }

    #[test]
    fn zero_trade_burst_warmup_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS"),
            String::from("0"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains(
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS must be greater than zero"
        ));
    }

    #[test]
    fn negative_detector_threshold_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD"),
            String::from("-0.5"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains(
            "SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD must be greater than zero"
        ));
    }

    #[test]
    fn invalid_health_threshold_order_is_rejected() {
        let settings = HashMap::from([
            (
                String::from("SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE"),
                String::from("40"),
            ),
            (
                String::from("SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE"),
                String::from("50"),
            ),
        ]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains(
            "SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE must be less than SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE"
        ));
    }

    #[test]
    fn health_penalty_above_score_range_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_HEALTH_CRITICAL_PENALTY"),
            String::from("101"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains("SIGNALGUARD_HEALTH_CRITICAL_PENALTY must be between 0 and 100"));
    }

    #[test]
    fn health_base_score_above_score_range_is_rejected() {
        let settings = HashMap::from([(
            String::from("SIGNALGUARD_HEALTH_BASE_SCORE"),
            String::from("101"),
        )]);

        let error = Settings::load_from_map(&settings).unwrap_err().to_string();

        assert!(error.contains("SIGNALGUARD_HEALTH_BASE_SCORE must be between 0 and 100"));
    }

    #[test]
    fn health_status_thresholds_classify_scores() {
        let settings = Settings::load_from_map(&HashMap::new()).unwrap();

        assert_eq!(
            settings.health.status_thresholds.classify(95),
            HealthStatus::Healthy
        );
        assert_eq!(
            settings.health.status_thresholds.classify(60),
            HealthStatus::Degraded
        );
        assert_eq!(
            settings.health.status_thresholds.classify(20),
            HealthStatus::Unhealthy
        );
    }
}

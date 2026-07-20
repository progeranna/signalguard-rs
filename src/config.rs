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
const DEFAULT_RUNTIME_PROFILE: RuntimeProfile = RuntimeProfile::Local;
const DEFAULT_REPLAY_PATH: &str = "examples/replay/sample.jsonl";
const DEFAULT_REPLAY_RESET_STATE: bool = true;
const DEFAULT_REPLAY_RESET_STORAGE: bool = true;
const DEFAULT_EVENT_CHANNEL_CAPACITY: usize = 1_024;
const MAX_EVENT_CHANNEL_CAPACITY: usize = 1_000_000;
const DEFAULT_BINANCE_WEBSOCKET_BASE_URL: &str = "wss://stream.binance.com:9443";
const DEFAULT_SYMBOLS: &[&str] = &["BTCUSDT"];
const DEFAULT_BINANCE_RECONNECT_MIN_BACKOFF_MS: u64 = 500;
const DEFAULT_BINANCE_RECONNECT_MAX_BACKOFF_MS: u64 = 5_000;
const DEFAULT_PRICE_MOVE_1M_PCT_THRESHOLD: &str = "2.5";
const DEFAULT_SPREAD_SPIKE_PCT_THRESHOLD: &str = "0.5";
const DEFAULT_TRADE_BURST_MULTIPLIER: &str = "3.0";
const DEFAULT_STALE_DATA_MS_THRESHOLD: u64 = 5_000;
const DEFAULT_TRADE_BURST_MIN_WARMUP_WINDOWS: u32 = 5;
const DEFAULT_QUOTE_STUCK_MS_THRESHOLD: u64 = 10_000;
const DEFAULT_EVENT_LAG_SPIKE_MS_THRESHOLD: u64 = 3_000;
const DEFAULT_DEPTH_SEQUENCE_GAP_MIN_INCREMENT: u64 = 1;
const DEFAULT_HEALTH_BASE_SCORE: u8 = 100;
const DEFAULT_HEALTH_INFO_PENALTY: u8 = 5;
const DEFAULT_HEALTH_WARNING_PENALTY: u8 = 15;
const DEFAULT_HEALTH_CRITICAL_PENALTY: u8 = 35;
const DEFAULT_HEALTH_STALE_DATA_PENALTY: u8 = 25;
const DEFAULT_HEALTH_RECENT_ANOMALY_WINDOW_SECS: u64 = 300;
const DEFAULT_HEALTHY_MIN_SCORE: u8 = 80;
const DEFAULT_DEGRADED_MIN_SCORE: u8 = 50;

type EnvMap = HashMap<String, String>;

#[derive(Debug)]
pub struct Settings {
    pub profile: RuntimeProfile,
    pub server: ServerSettings,
    pub enable_runtime_switch: bool,
    pub database: DatabaseSettings,
    pub redis: RedisSettings,
    pub ingestion: IngestionSettings,
    pub binance: BinanceSettings,
    pub detectors: DetectorSettings,
    pub health: HealthScoreSettings,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeProfile {
    Local,
    Production,
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
    pub replay_reset_state: bool,
    pub replay_reset_storage: bool,
    pub event_channel_capacity: usize,
}

#[derive(Debug)]
struct ReplaySettings {
    path: PathBuf,
    delay_ms: u64,
    reset_state: bool,
    reset_storage: bool,
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
    pub quote_stuck_ms_threshold: u64,
    pub event_lag_spike_ms_threshold: u64,
    pub depth_sequence_gap_min_increment: u64,
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

        let env_map = env::vars().collect::<EnvMap>();
        Self::load_from_map(&env_map)
    }

    fn load_from_map(env_map: &EnvMap) -> Result<Self> {
        let profile = load_runtime_profile(env_map)?;
        let server = load_server_settings(env_map)?;
        let enable_runtime_switch = load_enable_runtime_switch(env_map)?;
        let database = load_database_settings(env_map, profile)?;
        let redis = load_redis_settings(env_map, profile)?;
        let ingestion = load_ingestion_settings(env_map)?;
        let binance = load_binance_settings(env_map)?;
        let detectors = load_detector_settings(env_map)?;
        let health = load_health_settings(env_map)?;

        Ok(Self {
            profile,
            server,
            enable_runtime_switch,
            database,
            redis,
            ingestion,
            binance,
            detectors,
            health,
        })
    }
}

fn load_enable_runtime_switch(env_map: &EnvMap) -> Result<bool> {
    env_bool(env_map, "SIGNALGUARD_ENABLE_RUNTIME_SWITCH", false)
}

fn load_runtime_profile(env_map: &EnvMap) -> Result<RuntimeProfile> {
    env_value(env_map, "SIGNALGUARD_PROFILE")
        .map(parse_runtime_profile)
        .unwrap_or(Ok(DEFAULT_RUNTIME_PROFILE))
}

fn load_server_settings(env_map: &EnvMap) -> Result<ServerSettings> {
    let host = env_value(env_map, "SIGNALGUARD_HOST").unwrap_or_else(|| DEFAULT_HOST.to_owned());
    let port = env_value(env_map, "SIGNALGUARD_PORT")
        .map(parse_port)
        .unwrap_or(Ok(DEFAULT_PORT))?;

    Ok(ServerSettings { host, port })
}

fn load_database_settings(env_map: &EnvMap, profile: RuntimeProfile) -> Result<DatabaseSettings> {
    Ok(DatabaseSettings {
        url: database_url_for_profile(env_map, profile)?,
    })
}

fn load_redis_settings(env_map: &EnvMap, profile: RuntimeProfile) -> Result<RedisSettings> {
    Ok(RedisSettings {
        url: redis_url_for_profile(env_map, profile)?,
    })
}

fn load_ingestion_settings(env_map: &EnvMap) -> Result<IngestionSettings> {
    let mode = env_value(env_map, "SIGNALGUARD_INGESTION_MODE")
        .map(parse_ingestion_mode)
        .unwrap_or(Ok(IngestionMode::Replay))?;
    let symbols = env_value(env_map, "SIGNALGUARD_INGESTION_SYMBOLS")
        .map(parse_symbols)
        .unwrap_or_else(default_symbols)?;
    let replay = load_replay_settings(env_map)?;
    let event_channel_capacity = env_usize(
        env_map,
        "SIGNALGUARD_EVENT_CHANNEL_CAPACITY",
        DEFAULT_EVENT_CHANNEL_CAPACITY,
    )?;

    let ingestion = IngestionSettings {
        mode,
        symbols,
        replay_path: replay.path,
        replay_delay_ms: replay.delay_ms,
        replay_reset_state: replay.reset_state,
        replay_reset_storage: replay.reset_storage,
        event_channel_capacity,
    };
    ingestion.validate()?;

    Ok(ingestion)
}

fn load_replay_settings(env_map: &EnvMap) -> Result<ReplaySettings> {
    Ok(ReplaySettings {
        path: env_value(env_map, "SIGNALGUARD_INGESTION_REPLAY_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(DEFAULT_REPLAY_PATH)),
        delay_ms: env_u64(env_map, "SIGNALGUARD_INGESTION_REPLAY_DELAY_MS", 0)?,
        reset_state: env_bool(
            env_map,
            "SIGNALGUARD_REPLAY_RESET_STATE",
            DEFAULT_REPLAY_RESET_STATE,
        )?,
        reset_storage: env_bool(
            env_map,
            "SIGNALGUARD_REPLAY_RESET_STORAGE",
            DEFAULT_REPLAY_RESET_STORAGE,
        )?,
    })
}

fn load_binance_settings(env_map: &EnvMap) -> Result<BinanceSettings> {
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

    Ok(binance)
}

fn load_detector_settings(env_map: &EnvMap) -> Result<DetectorSettings> {
    let (price_move_1m_pct_threshold, spread_spike_pct_threshold) =
        load_price_spread_detector_thresholds(env_map)?;
    let stale_data_ms_threshold = env_u64(
        env_map,
        "SIGNALGUARD_DETECTORS_STALE_DATA_MS_THRESHOLD",
        DEFAULT_STALE_DATA_MS_THRESHOLD,
    )?;
    let (trade_burst_multiplier, trade_burst_min_warmup_windows) =
        load_trade_burst_detector_settings(env_map)?;
    let (quote_stuck_ms_threshold, event_lag_spike_ms_threshold) =
        load_quote_stuck_event_lag_thresholds(env_map)?;
    let depth_sequence_gap_min_increment = env_u64(
        env_map,
        "SIGNALGUARD_DETECTORS_DEPTH_SEQUENCE_GAP_MIN_INCREMENT",
        DEFAULT_DEPTH_SEQUENCE_GAP_MIN_INCREMENT,
    )?;

    let detectors = DetectorSettings {
        price_move_1m_pct_threshold,
        spread_spike_pct_threshold,
        stale_data_ms_threshold,
        trade_burst_multiplier,
        trade_burst_min_warmup_windows,
        quote_stuck_ms_threshold,
        event_lag_spike_ms_threshold,
        depth_sequence_gap_min_increment,
    };
    detectors.validate()?;

    Ok(detectors)
}

fn load_price_spread_detector_thresholds(env_map: &EnvMap) -> Result<(Decimal, Decimal)> {
    Ok((
        env_decimal(
            env_map,
            "SIGNALGUARD_DETECTORS_PRICE_MOVE_1M_PCT_THRESHOLD",
            DEFAULT_PRICE_MOVE_1M_PCT_THRESHOLD,
        )?,
        env_decimal(
            env_map,
            "SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD",
            DEFAULT_SPREAD_SPIKE_PCT_THRESHOLD,
        )?,
    ))
}

fn load_trade_burst_detector_settings(env_map: &EnvMap) -> Result<(Decimal, u32)> {
    Ok((
        env_decimal(
            env_map,
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MULTIPLIER",
            DEFAULT_TRADE_BURST_MULTIPLIER,
        )?,
        env_u32(
            env_map,
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS",
            DEFAULT_TRADE_BURST_MIN_WARMUP_WINDOWS,
        )?,
    ))
}

fn load_quote_stuck_event_lag_thresholds(env_map: &EnvMap) -> Result<(u64, u64)> {
    Ok((
        env_u64(
            env_map,
            "SIGNALGUARD_DETECTORS_QUOTE_STUCK_MS_THRESHOLD",
            DEFAULT_QUOTE_STUCK_MS_THRESHOLD,
        )?,
        env_u64(
            env_map,
            "SIGNALGUARD_DETECTORS_EVENT_LAG_SPIKE_MS_THRESHOLD",
            DEFAULT_EVENT_LAG_SPIKE_MS_THRESHOLD,
        )?,
    ))
}

fn load_health_settings(env_map: &EnvMap) -> Result<HealthScoreSettings> {
    let base_score = env_u8(
        env_map,
        "SIGNALGUARD_HEALTH_BASE_SCORE",
        DEFAULT_HEALTH_BASE_SCORE,
    )?;
    let severity_penalties = load_health_penalty_settings(env_map)?;
    let stale_data_penalty = env_u8(
        env_map,
        "SIGNALGUARD_HEALTH_STALE_DATA_PENALTY",
        DEFAULT_HEALTH_STALE_DATA_PENALTY,
    )?;
    let recent_anomaly_window_secs = env_u64(
        env_map,
        "SIGNALGUARD_HEALTH_RECENT_ANOMALY_WINDOW_SECS",
        DEFAULT_HEALTH_RECENT_ANOMALY_WINDOW_SECS,
    )?;
    let status_thresholds = load_health_status_thresholds(env_map)?;

    let health = HealthScoreSettings {
        base_score,
        severity_penalties,
        stale_data_penalty,
        recent_anomaly_window_secs,
        status_thresholds,
    };
    health.validate()?;

    Ok(health)
}

fn load_health_penalty_settings(env_map: &EnvMap) -> Result<SeverityPenaltySettings> {
    Ok(SeverityPenaltySettings {
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
    })
}

fn load_health_status_thresholds(env_map: &EnvMap) -> Result<HealthStatusThresholds> {
    Ok(HealthStatusThresholds {
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
    })
}

impl RuntimeProfile {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Production => "production",
        }
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

impl IngestionSettings {
    fn validate(&self) -> Result<()> {
        validate_non_zero(
            "SIGNALGUARD_EVENT_CHANNEL_CAPACITY",
            self.event_channel_capacity,
        )?;
        if self.event_channel_capacity > MAX_EVENT_CHANNEL_CAPACITY {
            bail!(
                "SIGNALGUARD_EVENT_CHANNEL_CAPACITY must be less than or equal to {MAX_EVENT_CHANNEL_CAPACITY}"
            );
        }

        Ok(())
    }
}

impl BinanceSettings {
    fn validate(&self) -> Result<()> {
        if self.websocket_base_url.trim().is_empty() {
            bail!("SIGNALGUARD_BINANCE_WEBSOCKET_BASE_URL must not be empty");
        }
        validate_non_zero(
            "SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS",
            self.reconnect_min_backoff_ms,
        )?;
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
        validate_non_zero(
            "SIGNALGUARD_DETECTORS_STALE_DATA_MS_THRESHOLD",
            self.stale_data_ms_threshold,
        )?;
        validate_positive_decimal(
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MULTIPLIER",
            self.trade_burst_multiplier,
        )?;
        validate_non_zero(
            "SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS",
            self.trade_burst_min_warmup_windows,
        )?;
        validate_non_zero(
            "SIGNALGUARD_DETECTORS_QUOTE_STUCK_MS_THRESHOLD",
            self.quote_stuck_ms_threshold,
        )?;
        validate_non_zero(
            "SIGNALGUARD_DETECTORS_EVENT_LAG_SPIKE_MS_THRESHOLD",
            self.event_lag_spike_ms_threshold,
        )?;
        validate_non_zero(
            "SIGNALGUARD_DETECTORS_DEPTH_SEQUENCE_GAP_MIN_INCREMENT",
            self.depth_sequence_gap_min_increment,
        )?;

        Ok(())
    }
}

impl HealthScoreSettings {
    fn validate(&self) -> Result<()> {
        self.severity_penalties.validate()?;
        self.status_thresholds.validate()?;

        validate_score_at_most_100("SIGNALGUARD_HEALTH_BASE_SCORE", self.base_score)?;
        validate_score_at_most_100(
            "SIGNALGUARD_HEALTH_STALE_DATA_PENALTY",
            self.stale_data_penalty,
        )?;
        validate_non_zero(
            "SIGNALGUARD_HEALTH_RECENT_ANOMALY_WINDOW_SECS",
            self.recent_anomaly_window_secs,
        )?;
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
        validate_score_at_most_100("SIGNALGUARD_HEALTH_INFO_PENALTY", self.info)?;
        validate_score_at_most_100("SIGNALGUARD_HEALTH_WARNING_PENALTY", self.warning)?;
        validate_score_at_most_100("SIGNALGUARD_HEALTH_CRITICAL_PENALTY", self.critical)?;
        if self.info > self.warning || self.warning > self.critical {
            bail!("health severity penalties must be ordered info <= warning <= critical");
        }

        Ok(())
    }
}

impl HealthStatusThresholds {
    fn validate(&self) -> Result<()> {
        validate_score_at_most_100(
            "SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE",
            self.healthy_min_score,
        )?;
        validate_score_at_most_100(
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

fn env_value(env_map: &EnvMap, key: &str) -> Option<String> {
    env_map.get(key).cloned()
}

fn parse_runtime_profile(value: String) -> Result<RuntimeProfile> {
    match value.as_str() {
        "local" => Ok(RuntimeProfile::Local),
        "production" => Ok(RuntimeProfile::Production),
        _ => bail!("SIGNALGUARD_PROFILE must be 'local' or 'production': {value}"),
    }
}

fn database_url_for_profile(env_map: &EnvMap, profile: RuntimeProfile) -> Result<String> {
    match (profile, env_value(env_map, "SIGNALGUARD_DATABASE_URL")) {
        (_, Some(url)) => Ok(url),
        (RuntimeProfile::Local, None) => {
            bail!(
                "SIGNALGUARD_DATABASE_URL must be set when SIGNALGUARD_PROFILE=local; use .env.example, docker compose, or scripts/demo-replay.sh for the local demo"
            )
        }
        (RuntimeProfile::Production, None) => {
            bail!("SIGNALGUARD_DATABASE_URL must be set when SIGNALGUARD_PROFILE=production")
        }
    }
}

fn redis_url_for_profile(env_map: &EnvMap, profile: RuntimeProfile) -> Result<String> {
    match (profile, env_value(env_map, "SIGNALGUARD_REDIS_URL")) {
        (_, Some(url)) => Ok(url),
        (RuntimeProfile::Local, None) => {
            bail!(
                "SIGNALGUARD_REDIS_URL must be set when SIGNALGUARD_PROFILE=local; use .env.example, docker compose, or scripts/demo-replay.sh for the local demo"
            )
        }
        (RuntimeProfile::Production, None) => {
            bail!("SIGNALGUARD_REDIS_URL must be set when SIGNALGUARD_PROFILE=production")
        }
    }
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

fn env_parse<T, D>(env_map: &EnvMap, key: &str, default: D, expected: &str) -> Result<T>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
    D: std::fmt::Display,
{
    let raw_value = env_value(env_map, key).unwrap_or_else(|| default.to_string());
    raw_value
        .parse::<T>()
        .with_context(|| format!("{key} must be {expected}: {raw_value}"))
}

fn env_decimal(env_map: &EnvMap, key: &str, default: &str) -> Result<Decimal> {
    env_parse(env_map, key, default, "a valid decimal value")
}

fn env_u64(env_map: &EnvMap, key: &str, default: u64) -> Result<u64> {
    env_parse(env_map, key, default, "a valid integer value")
}

fn env_u32(env_map: &EnvMap, key: &str, default: u32) -> Result<u32> {
    env_parse(env_map, key, default, "a valid integer value")
}

fn env_u8(env_map: &EnvMap, key: &str, default: u8) -> Result<u8> {
    env_parse(
        env_map,
        key,
        default,
        "a valid integer value between 0 and 255",
    )
}

fn env_usize(env_map: &EnvMap, key: &str, default: usize) -> Result<usize> {
    env_parse(env_map, key, default, "a valid integer value")
}

fn env_bool(env_map: &EnvMap, key: &str, default: bool) -> Result<bool> {
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

fn validate_non_zero<T>(key: &str, value: T) -> Result<()>
where
    T: PartialEq + From<u8>,
{
    if value == T::from(0) {
        bail!("{key} must be greater than zero");
    }

    Ok(())
}

fn validate_score_at_most_100(key: &str, value: u8) -> Result<()> {
    if value > 100 {
        bail!("{key} must be between 0 and 100");
    }

    Ok(())
}

#[cfg(test)]
mod tests;

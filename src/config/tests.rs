use std::collections::HashMap;

use crate::domain::HealthStatus;

use super::{IngestionMode, RuntimeProfile, Settings};

const TEST_DATABASE_URL: &str = "test-database-url";
const TEST_REDIS_URL: &str = "test-redis-url";
const TEST_PRODUCTION_DATABASE_URL: &str = "production-database-url";
const TEST_PRODUCTION_REDIS_URL: &str = "production-redis-url";

fn base_env() -> HashMap<String, String> {
    HashMap::new()
}

fn local_env_with_storage() -> HashMap<String, String> {
    let mut env = base_env();
    with_var(&mut env, "SIGNALGUARD_DATABASE_URL", TEST_DATABASE_URL);
    with_var(&mut env, "SIGNALGUARD_REDIS_URL", TEST_REDIS_URL);
    env
}

fn production_env_with_storage() -> HashMap<String, String> {
    let mut env = base_env();
    with_var(&mut env, "SIGNALGUARD_PROFILE", "production");
    with_var(
        &mut env,
        "SIGNALGUARD_DATABASE_URL",
        TEST_PRODUCTION_DATABASE_URL,
    );
    with_var(&mut env, "SIGNALGUARD_REDIS_URL", TEST_PRODUCTION_REDIS_URL);
    env
}

fn env_with<const N: usize>(overrides: [(&str, &str); N]) -> HashMap<String, String> {
    let mut env = base_env();
    with_vars(&mut env, overrides);
    env
}

fn local_env_with<const N: usize>(overrides: [(&str, &str); N]) -> HashMap<String, String> {
    let mut env = local_env_with_storage();
    with_vars(&mut env, overrides);
    env
}

fn with_vars<const N: usize>(env: &mut HashMap<String, String>, overrides: [(&str, &str); N]) {
    for (key, value) in overrides {
        with_var(env, key, value);
    }
}

fn with_var(env: &mut HashMap<String, String>, key: &str, value: &str) {
    env.insert(String::from(key), String::from(value));
}

fn load(env: HashMap<String, String>) -> anyhow::Result<Settings> {
    Settings::load_from_map(&env)
}

fn load_error(env: HashMap<String, String>) -> String {
    load(env).unwrap_err().to_string()
}

fn assert_load_error_contains(env: HashMap<String, String>, expected: &str) {
    let error = load_error(env);
    assert!(
        error.contains(expected),
        "expected error to contain {expected:?}, got {error:?}"
    );
}

// Runtime profile

#[test]
fn settings_default_profile_is_local() {
    let settings = load(local_env_with_storage()).unwrap();

    assert_eq!(settings.profile, RuntimeProfile::Local);
}

#[test]
fn invalid_runtime_profile_is_rejected() {
    let settings = env_with([("SIGNALGUARD_PROFILE", "staging")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_PROFILE must be 'local' or 'production': staging",
    );
}

#[test]
fn runtime_switch_defaults_to_disabled() {
    let settings = load(local_env_with_storage()).unwrap();

    assert!(!settings.enable_runtime_switch);
}

#[test]
fn runtime_switch_can_be_enabled() {
    let settings = load(local_env_with([(
        "SIGNALGUARD_ENABLE_RUNTIME_SWITCH",
        "true",
    )]))
    .unwrap();

    assert!(settings.enable_runtime_switch);
}

// Required storage/cache URLs

#[test]
fn local_profile_without_database_url_is_rejected() {
    let settings = env_with([
        ("SIGNALGUARD_PROFILE", "local"),
        ("SIGNALGUARD_REDIS_URL", TEST_REDIS_URL),
    ]);

    let error = load_error(settings);

    assert_eq!(
        error,
        "SIGNALGUARD_DATABASE_URL must be set when SIGNALGUARD_PROFILE=local; use .env.example, docker compose, or scripts/demo-replay.sh for the local demo"
    );
}

#[test]
fn local_profile_without_redis_url_is_rejected() {
    let settings = env_with([
        ("SIGNALGUARD_PROFILE", "local"),
        ("SIGNALGUARD_DATABASE_URL", TEST_DATABASE_URL),
    ]);

    let error = load_error(settings);

    assert_eq!(
        error,
        "SIGNALGUARD_REDIS_URL must be set when SIGNALGUARD_PROFILE=local; use .env.example, docker compose, or scripts/demo-replay.sh for the local demo"
    );
}

#[test]
fn production_profile_without_database_url_is_rejected() {
    let settings = env_with([
        ("SIGNALGUARD_PROFILE", "production"),
        ("SIGNALGUARD_REDIS_URL", TEST_PRODUCTION_REDIS_URL),
    ]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DATABASE_URL must be set when SIGNALGUARD_PROFILE=production",
    );
}

#[test]
fn production_profile_without_redis_url_is_rejected() {
    let settings = env_with([
        ("SIGNALGUARD_PROFILE", "production"),
        ("SIGNALGUARD_DATABASE_URL", TEST_PRODUCTION_DATABASE_URL),
    ]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_REDIS_URL must be set when SIGNALGUARD_PROFILE=production",
    );
}

#[test]
fn local_profile_with_explicit_database_and_redis_urls_succeeds() {
    let loaded = load(local_env_with([("SIGNALGUARD_PROFILE", "local")])).unwrap();

    assert_eq!(loaded.profile, RuntimeProfile::Local);
    assert_eq!(loaded.database.url, TEST_DATABASE_URL);
    assert_eq!(loaded.redis.url, TEST_REDIS_URL);
}

#[test]
fn production_profile_with_explicit_database_and_redis_urls_succeeds() {
    let loaded = load(production_env_with_storage()).unwrap();

    assert_eq!(loaded.profile, RuntimeProfile::Production);
    assert_eq!(loaded.database.url, TEST_PRODUCTION_DATABASE_URL);
    assert_eq!(loaded.redis.url, TEST_PRODUCTION_REDIS_URL);
}

// Server parsing

#[test]
fn server_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

    assert_eq!(settings.server.host, "127.0.0.1");
    assert_eq!(settings.server.port, 8080);
}

#[test]
fn invalid_server_address_is_rejected() {
    let loaded = load(local_env_with([("SIGNALGUARD_HOST", "invalid host name")])).unwrap();
    let error = loaded.server.socket_address().unwrap_err().to_string();

    assert!(error.contains("invalid server address"));
}

#[test]
fn invalid_port_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_PORT", "not-a-port")]);

    assert_load_error_contains(settings, "SIGNALGUARD_PORT must be a valid port");
}

// Ingestion mode

#[test]
fn ingestion_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

    assert_eq!(settings.ingestion.mode, IngestionMode::Replay);
    assert_eq!(settings.ingestion.symbols.len(), 1);
    assert_eq!(settings.ingestion.symbols[0].as_str(), "BTCUSDT");
    assert_eq!(settings.ingestion.event_channel_capacity, 1_024);
}

#[test]
fn invalid_ingestion_mode_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_INGESTION_MODE", "paper")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_INGESTION_MODE must be 'replay' or 'live'",
    );
}

#[test]
fn ingestion_symbols_are_normalized_to_symbols() {
    let loaded = load(local_env_with([(
        "SIGNALGUARD_INGESTION_SYMBOLS",
        "btcusdt, ethusdt",
    )]))
    .unwrap();

    assert_eq!(loaded.ingestion.symbols[0].as_str(), "BTCUSDT");
    assert_eq!(loaded.ingestion.symbols[1].as_str(), "ETHUSDT");
}

#[test]
fn invalid_ingestion_symbol_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_INGESTION_SYMBOLS", "BTC-USDT")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_INGESTION_SYMBOLS contains an invalid symbol: BTC-USDT",
    );
}

#[test]
fn event_channel_capacity_override_is_loaded() {
    let loaded = load(local_env_with([(
        "SIGNALGUARD_EVENT_CHANNEL_CAPACITY",
        "2048",
    )]))
    .unwrap();

    assert_eq!(loaded.ingestion.event_channel_capacity, 2_048);
}

// Replay settings

#[test]
fn replay_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

    assert_eq!(
        settings.ingestion.replay_path.as_os_str(),
        "examples/replay/sample.jsonl"
    );
    assert_eq!(settings.ingestion.replay_delay_ms, 0);
    assert!(settings.ingestion.replay_reset_storage);
}

#[test]
fn replay_overrides_are_loaded() {
    let loaded = load(local_env_with([
        ("SIGNALGUARD_INGESTION_REPLAY_DELAY_MS", "25"),
        ("SIGNALGUARD_REPLAY_RESET_STORAGE", "false"),
    ]))
    .unwrap();

    assert_eq!(loaded.ingestion.replay_delay_ms, 25);
    assert!(!loaded.ingestion.replay_reset_storage);
}

#[test]
fn replay_reset_storage_defaults_to_true() {
    let settings = load(local_env_with_storage()).unwrap();

    assert!(settings.ingestion.replay_reset_storage);
}

#[test]
fn replay_reset_storage_can_be_disabled() {
    let loaded = load(local_env_with([(
        "SIGNALGUARD_REPLAY_RESET_STORAGE",
        "false",
    )]))
    .unwrap();

    assert!(!loaded.ingestion.replay_reset_storage);
}

// Binance settings

#[test]
fn binance_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

    assert_eq!(
        settings.binance.websocket_base_url,
        "wss://stream.binance.com:9443"
    );
    assert_eq!(settings.binance.reconnect_min_backoff_ms, 500);
    assert_eq!(settings.binance.reconnect_max_backoff_ms, 5_000);
}

#[test]
fn binance_backoff_override_is_loaded() {
    let loaded = load(local_env_with([(
        "SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS",
        "1000",
    )]))
    .unwrap();

    assert_eq!(loaded.binance.reconnect_max_backoff_ms, 1_000);
}

// Detector settings

#[test]
fn detector_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

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
    assert_eq!(settings.detectors.quote_stuck_ms_threshold, 10_000);
    assert_eq!(settings.detectors.event_lag_spike_ms_threshold, 3_000);
    assert_eq!(settings.detectors.depth_sequence_gap_min_increment, 1);
}

#[test]
fn detector_threshold_override_is_loaded() {
    let loaded = load(local_env_with([
        ("SIGNALGUARD_DETECTORS_PRICE_MOVE_1M_PCT_THRESHOLD", "1.25"),
        ("SIGNALGUARD_DETECTORS_QUOTE_STUCK_MS_THRESHOLD", "15000"),
        ("SIGNALGUARD_DETECTORS_EVENT_LAG_SPIKE_MS_THRESHOLD", "4500"),
        (
            "SIGNALGUARD_DETECTORS_DEPTH_SEQUENCE_GAP_MIN_INCREMENT",
            "2",
        ),
    ]))
    .unwrap();

    assert_eq!(
        loaded.detectors.price_move_1m_pct_threshold.to_string(),
        "1.25"
    );
    assert_eq!(loaded.detectors.quote_stuck_ms_threshold, 15_000);
    assert_eq!(loaded.detectors.event_lag_spike_ms_threshold, 4_500);
    assert_eq!(loaded.detectors.depth_sequence_gap_min_increment, 2);
}

// Health settings

#[test]
fn health_defaults_are_loaded() {
    let settings = load(local_env_with_storage()).unwrap();

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
fn health_status_thresholds_classify_scores() {
    let settings = load(local_env_with_storage()).unwrap();

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

// Validation failures

#[test]
fn zero_event_channel_capacity_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_EVENT_CHANNEL_CAPACITY", "0")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_EVENT_CHANNEL_CAPACITY must be greater than zero",
    );
}

#[test]
fn oversized_event_channel_capacity_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_EVENT_CHANNEL_CAPACITY", "1000001")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_EVENT_CHANNEL_CAPACITY must be less than or equal to 1000000",
    );
}

#[test]
fn invalid_replay_reset_storage_value_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_REPLAY_RESET_STORAGE", "maybe")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_REPLAY_RESET_STORAGE must be 'true' or 'false'",
    );
}

#[test]
fn invalid_runtime_switch_value_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_ENABLE_RUNTIME_SWITCH", "maybe")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_ENABLE_RUNTIME_SWITCH must be 'true' or 'false'",
    );
}

#[test]
fn invalid_binance_backoff_range_is_rejected() {
    let settings = local_env_with([
        ("SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS", "2000"),
        ("SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS", "1000"),
    ]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS must be greater than or equal to SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS",
    );
}

#[test]
fn zero_trade_burst_warmup_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS", "0")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DETECTORS_TRADE_BURST_MIN_WARMUP_WINDOWS must be greater than zero",
    );
}

#[test]
fn negative_detector_threshold_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD", "-0.5")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DETECTORS_SPREAD_SPIKE_PCT_THRESHOLD must be greater than zero",
    );
}

#[test]
fn zero_quote_stuck_threshold_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_DETECTORS_QUOTE_STUCK_MS_THRESHOLD", "0")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DETECTORS_QUOTE_STUCK_MS_THRESHOLD must be greater than zero",
    );
}

#[test]
fn zero_event_lag_spike_threshold_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_DETECTORS_EVENT_LAG_SPIKE_MS_THRESHOLD", "0")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DETECTORS_EVENT_LAG_SPIKE_MS_THRESHOLD must be greater than zero",
    );
}

#[test]
fn zero_depth_sequence_gap_increment_is_rejected() {
    let settings = local_env_with([(
        "SIGNALGUARD_DETECTORS_DEPTH_SEQUENCE_GAP_MIN_INCREMENT",
        "0",
    )]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_DETECTORS_DEPTH_SEQUENCE_GAP_MIN_INCREMENT must be greater than zero",
    );
}

#[test]
fn invalid_health_threshold_order_is_rejected() {
    let settings = local_env_with([
        ("SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE", "40"),
        ("SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE", "50"),
    ]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_HEALTH_DEGRADED_MIN_SCORE must be less than SIGNALGUARD_HEALTH_HEALTHY_MIN_SCORE",
    );
}

#[test]
fn health_penalty_above_score_range_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_HEALTH_CRITICAL_PENALTY", "101")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_HEALTH_CRITICAL_PENALTY must be between 0 and 100",
    );
}

#[test]
fn health_base_score_above_score_range_is_rejected() {
    let settings = local_env_with([("SIGNALGUARD_HEALTH_BASE_SCORE", "101")]);

    assert_load_error_contains(
        settings,
        "SIGNALGUARD_HEALTH_BASE_SCORE must be between 0 and 100",
    );
}

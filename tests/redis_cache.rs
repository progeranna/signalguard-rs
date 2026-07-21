use std::{
    sync::OnceLock,
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::{TimeZone, Utc};
use redis::AsyncCommands;
use rust_decimal::Decimal;
use signalguard_rs::{
    domain::{MarketSignals, MarketState, Symbol},
    startup::{MarketStateStartupPolicy, prepare_market_state_cache},
    storage::RedisCache,
    telemetry::InternalCounters,
};
use tokio::sync::Mutex;

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn set_and_get_market_state_round_trip() {
    let _guard = redis_test_lock().lock().await;
    let (cache, _redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let state = test_market_state(test_symbol("ROUND1"));
    cache.set_market_state(&state).await.unwrap();

    let loaded = cache.get_market_state(&state.symbol).await.unwrap();

    assert_eq!(loaded, Some(state.clone()));

    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn list_symbols_includes_inserted_market_state_symbol() {
    let _guard = redis_test_lock().lock().await;
    let (cache, _redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let state = test_market_state(test_symbol("SYMS1"));
    cache.set_market_state(&state).await.unwrap();

    let symbols = cache.list_symbols().await.unwrap();

    assert!(symbols.contains(&state.symbol));

    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn missing_symbol_returns_none() {
    let _guard = redis_test_lock().lock().await;
    let (cache, _redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let missing_symbol = test_symbol("MISS1");
    let loaded = cache.get_market_state(&missing_symbol).await.unwrap();

    assert!(loaded.is_none());

    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn preserve_startup_policy_keeps_registered_market_state() {
    let _guard = redis_test_lock().lock().await;
    let (cache, _redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let state = test_market_state(test_symbol("PRES1"));
    cache.set_market_state(&state).await.unwrap();

    let counters = InternalCounters::default();
    let prepared = prepare_market_state_cache(
        Some(cache.clone()),
        MarketStateStartupPolicy::PreserveAndValidate,
        &counters,
    )
    .await;

    assert!(prepared.is_available());
    assert!(
        prepared
            .list_symbols()
            .await
            .unwrap()
            .contains(&state.symbol)
    );
    assert_eq!(
        prepared.get_market_state(&state.symbol).await.unwrap(),
        Some(state.clone())
    );

    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn reset_startup_policy_removes_signalguard_state_but_preserves_unrelated_key() {
    let _guard = redis_test_lock().lock().await;
    let (cache, redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let state = test_market_state(test_symbol("RSET1"));
    cache.set_market_state(&state).await.unwrap();

    let client = redis::Client::open(redis_url.as_str()).unwrap();
    let mut connection = client.get_multiplexed_async_connection().await.unwrap();
    let unrelated_key = unrelated_key();
    let (): () = connection.set(&unrelated_key, "keep-me").await.unwrap();

    let counters = InternalCounters::default();
    let prepared = prepare_market_state_cache(
        Some(cache.clone()),
        MarketStateStartupPolicy::Reset,
        &counters,
    )
    .await;

    assert!(prepared.is_available());
    assert!(prepared.list_symbols().await.unwrap().is_empty());
    assert!(
        prepared
            .get_market_state(&state.symbol)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        connection
            .get::<_, Option<String>>(&unrelated_key)
            .await
            .unwrap(),
        Some(String::from("keep-me"))
    );

    let deleted_count: usize = connection.del(&unrelated_key).await.unwrap();
    assert_eq!(deleted_count, 1);
    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn invalid_preserved_cache_is_rejected_without_implicit_deletion() {
    let _guard = redis_test_lock().lock().await;
    let (cache, redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let symbol = test_symbol("BADJ1");
    let state_key = format!("signalguard:market_state:{}", symbol.as_str());
    let malformed_payload = "{not-json";
    let client = redis::Client::open(redis_url.as_str()).unwrap();
    let mut connection = client.get_multiplexed_async_connection().await.unwrap();
    let (): () = connection
        .sadd("signalguard:symbols", symbol.as_str())
        .await
        .unwrap();
    let (): () = connection.set(&state_key, malformed_payload).await.unwrap();

    let error = cache.validate_market_state_cache().await.unwrap_err();

    assert!(error.to_string().contains("is malformed"));
    assert_eq!(
        connection
            .get::<_, Option<String>>(&state_key)
            .await
            .unwrap(),
        Some(String::from(malformed_payload))
    );
    let registered: bool = connection
        .sismember("signalguard:symbols", symbol.as_str())
        .await
        .unwrap();
    assert!(registered);

    cache.clear_market_state_cache().await.unwrap();
}

#[tokio::test]
#[ignore = "requires local Redis via docker compose and REDIS_URL"]
async fn clear_market_state_cache_removes_signalguard_keys_but_preserves_unrelated_keys() {
    let _guard = redis_test_lock().lock().await;
    let (cache, redis_url) = test_cache().await;
    cache.clear_market_state_cache().await.unwrap();

    let state = test_market_state(test_symbol("CLER1"));
    cache.set_market_state(&state).await.unwrap();

    let client = redis::Client::open(redis_url.as_str()).unwrap();
    let mut connection = client.get_multiplexed_async_connection().await.unwrap();
    let unrelated_key = unrelated_key();
    let (): () = connection.set(&unrelated_key, "keep-me").await.unwrap();

    let cleared_keys = cache.clear_market_state_cache().await.unwrap();

    assert!(cleared_keys >= 2);
    assert!(
        cache
            .get_market_state(&state.symbol)
            .await
            .unwrap()
            .is_none()
    );
    assert!(cache.list_symbols().await.unwrap().is_empty());
    assert_eq!(
        connection
            .get::<_, Option<String>>(&unrelated_key)
            .await
            .unwrap(),
        Some(String::from("keep-me"))
    );

    let deleted_count: usize = connection.del(&unrelated_key).await.unwrap();
    assert_eq!(deleted_count, 1);
    cache.clear_market_state_cache().await.unwrap();
}

async fn test_cache() -> (RedisCache, String) {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| {
        panic!(
            "REDIS_URL is required for Redis integration tests; run `docker compose up -d redis`, `export REDIS_URL=\"redis://127.0.0.1:6379\"`, then `cargo test --test redis_cache -- --ignored`"
        )
    });
    let cache = RedisCache::connect(&redis_url)
        .await
        .unwrap_or_else(|error| {
            panic!("failed to connect to Redis integration test cache: {error}")
        });

    (cache, redis_url)
}

fn redis_test_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn test_market_state(symbol: Symbol) -> MarketState {
    let mut state = MarketState::new(symbol);
    state.last_trade_price = Some(Decimal::new(6500010, 2));
    state.last_trade_quantity = Some(Decimal::new(125, 3));
    state.best_bid_price = Some(Decimal::new(6499910, 2));
    state.best_bid_quantity = Some(Decimal::new(2500, 3));
    state.best_ask_price = Some(Decimal::new(6500020, 2));
    state.best_ask_quantity = Some(Decimal::new(1750, 3));
    state.signals = MarketSignals {
        spread_pct: Some(0.016923074556548556),
        price_change_1m_pct: Some(0.42),
        trades_per_minute: Some(7.0),
    };
    state.last_event_time = Some(fixed_time(2026, 1, 1, 0, 0, 0));
    state.last_ingest_time = Some(fixed_time(2026, 1, 1, 0, 0, 1));
    state
}

fn test_symbol(prefix: &str) -> Symbol {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    Symbol::new(format!("SG{prefix}{unique_suffix}")).unwrap()
}

fn unrelated_key() -> String {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    format!("integration:unrelated:{unique_suffix}")
}

fn fixed_time(
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, day, hour, minute, second)
        .unwrap()
}

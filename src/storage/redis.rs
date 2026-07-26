use std::{
    collections::HashMap,
    sync::{Arc, Mutex, MutexGuard},
};

use redis::AsyncCommands;
use serde::{Serialize, de::DeserializeOwned};
use thiserror::Error;
use tracing::info;

use crate::domain::{MarketState, Symbol};

const MARKET_STATE_KEY_PREFIX: &str = "signalguard:market_state:";
const SYMBOL_SET_KEY: &str = "signalguard:symbols";
const SET_MARKET_STATE_SCRIPT: &str = r#"
local state_key_type = redis.call("TYPE", KEYS[1]).ok
if state_key_type ~= "none" and state_key_type ~= "string" then
    return redis.error_reply(
        "signalguard market state key has incompatible type: " .. state_key_type
    )
end

local symbols_key_type = redis.call("TYPE", KEYS[2]).ok
if symbols_key_type ~= "none" and symbols_key_type ~= "set" then
    return redis.error_reply(
        "signalguard symbols key has incompatible type: " .. symbols_key_type
    )
end

redis.call("SET", KEYS[1], ARGV[2])
redis.call("SADD", KEYS[2], ARGV[1])
return 1
"#;

#[derive(Clone, Debug)]
pub struct RedisCache {
    client: Option<redis::Client>,
    connection: Option<redis::aio::MultiplexedConnection>,
    in_memory_states: Option<Arc<Mutex<HashMap<Symbol, MarketState>>>>,
    #[cfg(test)]
    in_memory_symbols: Option<Arc<Mutex<Vec<Symbol>>>>,
    #[cfg(test)]
    forced_failure: Option<&'static str>,
}

#[derive(Debug, Error)]
pub enum CacheError {
    #[error("redis cache is unavailable")]
    Unavailable,
    #[error("redis operation `{operation}` failed: {source}")]
    Redis {
        operation: &'static str,
        #[source]
        source: redis::RedisError,
    },
    #[error("cache serialization failed for `{operation}`: {source}")]
    Serialization {
        operation: &'static str,
        #[source]
        source: serde_json::Error,
    },
    #[error("cache data is invalid for `{operation}`: {message}")]
    InvalidData {
        operation: &'static str,
        message: String,
    },
    #[error("in-memory cache lock failed for `{operation}`")]
    InMemoryLock { operation: &'static str },
}

impl RedisCache {
    pub async fn connect(redis_url: &str) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        let mut connection = client.get_multiplexed_async_connection().await?;
        let _: String = redis::cmd("PING").query_async(&mut connection).await?;

        Ok(Self {
            client: Some(client),
            connection: Some(connection),
            in_memory_states: None,
            #[cfg(test)]
            in_memory_symbols: None,
            #[cfg(test)]
            forced_failure: None,
        })
    }

    pub fn unavailable() -> Self {
        Self {
            client: None,
            connection: None,
            in_memory_states: None,
            #[cfg(test)]
            in_memory_symbols: None,
            #[cfg(test)]
            forced_failure: None,
        }
    }

    pub fn is_available(&self) -> bool {
        self.client.is_some() || self.in_memory_states.is_some() || {
            #[cfg(test)]
            {
                self.in_memory_symbols.is_some()
            }
            #[cfg(not(test))]
            {
                false
            }
        }
    }

    pub async fn set_market_state(&self, state: &MarketState) -> Result<(), CacheError> {
        let operation = "set_market_state";
        if let Some(states) = &self.in_memory_states {
            lock_in_memory_states(states, operation)?.insert(state.symbol.clone(), state.clone());
            return Ok(());
        }

        let key = market_state_key(&state.symbol);
        let payload = serialize(operation, state)?;
        let mut connection = self.connection_for(operation).await?;
        let script = redis::Script::new(SET_MARKET_STATE_SCRIPT);

        let _: i64 = script
            .key(&key)
            .key(SYMBOL_SET_KEY)
            .arg(state.symbol.as_str())
            .arg(payload)
            .invoke_async(&mut connection)
            .await
            .map_err(redis_error(operation))?;

        Ok(())
    }

    pub async fn get_market_state(
        &self,
        symbol: &Symbol,
    ) -> Result<Option<MarketState>, CacheError> {
        let operation = "get_market_state";
        if let Some(states) = &self.in_memory_states {
            return Ok(lock_in_memory_states(states, operation)?
                .get(symbol)
                .cloned());
        }

        let mut connection = self.connection_for(operation).await?;
        let payload: Option<String> = connection
            .get(market_state_key(symbol))
            .await
            .map_err(redis_error(operation))?;

        payload
            .map(|json| deserialize(operation, &json))
            .transpose()
    }

    pub async fn list_symbols(&self) -> Result<Vec<Symbol>, CacheError> {
        let operation = "list_symbols";
        #[cfg(test)]
        if let Some(symbols) = &self.in_memory_symbols {
            let mut symbols = lock_in_memory_symbols(symbols, operation)?.clone();
            symbols.sort();
            return Ok(symbols);
        }

        if let Some(states) = &self.in_memory_states {
            let mut symbols = lock_in_memory_states(states, operation)?
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            symbols.sort();
            return Ok(symbols);
        }

        let mut connection = self.connection_for(operation).await?;
        let raw_symbols: Vec<String> = connection
            .smembers(SYMBOL_SET_KEY)
            .await
            .map_err(redis_error(operation))?;

        let mut symbols = raw_symbols
            .into_iter()
            .map(|raw_symbol| {
                Symbol::new(raw_symbol).map_err(|error| CacheError::InvalidData {
                    operation,
                    message: error.to_string(),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        symbols.sort();

        Ok(symbols)
    }

    pub async fn validate_market_state_cache(&self) -> Result<usize, CacheError> {
        let operation = "validate_market_state_cache";
        self.fail_if_forced(operation)?;

        let raw_symbols = self.registered_symbol_values(operation).await?;
        let mut symbols = raw_symbols
            .into_iter()
            .map(|raw_symbol| {
                let symbol =
                    Symbol::new(raw_symbol.clone()).map_err(|error| CacheError::InvalidData {
                        operation,
                        message: format!("registered symbol `{raw_symbol}` is invalid: {error}"),
                    })?;
                if raw_symbol != symbol.as_str() {
                    return Err(CacheError::InvalidData {
                        operation,
                        message: format!(
                            "registered symbol `{raw_symbol}` is not canonical; expected `{symbol}`"
                        ),
                    });
                }

                Ok(symbol)
            })
            .collect::<Result<Vec<_>, CacheError>>()?;
        symbols.sort();

        for symbol in &symbols {
            let payload = self
                .market_state_payload(symbol, operation)
                .await?
                .ok_or_else(|| CacheError::InvalidData {
                    operation,
                    message: format!(
                        "registered symbol `{symbol}` has no corresponding market-state value"
                    ),
                })?;
            let state = deserialize_market_state_for_validation(operation, symbol, &payload)?;
            if state.symbol.as_str() != symbol.as_str() {
                return Err(CacheError::InvalidData {
                    operation,
                    message: format!(
                        "market-state key for `{symbol}` contains embedded symbol `{}`",
                        state.symbol
                    ),
                });
            }
        }

        Ok(symbols.len())
    }

    pub async fn clear_market_state_cache(&self) -> Result<usize, CacheError> {
        let operation = "clear_market_state_cache";
        self.fail_if_forced(operation)?;
        #[cfg(test)]
        if let Some(symbols) = &self.in_memory_symbols {
            lock_in_memory_symbols(symbols, operation)?.clear();
        }

        if let Some(states) = &self.in_memory_states {
            let mut states = lock_in_memory_states(states, operation)?;
            let cleared_keys = states.len();
            states.clear();
            return Ok(cleared_keys);
        }

        let mut connection = self.connection_for(operation).await?;
        let mut cursor = 0u64;
        let mut cleared_keys = 0usize;
        loop {
            let (next_cursor, batch): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(market_state_pattern())
                .query_async(&mut connection)
                .await
                .map_err(redis_error(operation))?;
            if !batch.is_empty() {
                let deleted: usize = connection
                    .del(batch)
                    .await
                    .map_err(redis_error(operation))?;
                cleared_keys += deleted;
            }

            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        let deleted_symbols: usize = connection
            .del(symbol_set_key())
            .await
            .map_err(redis_error(operation))?;
        cleared_keys += deleted_symbols;

        info!(cleared_keys, "cleared SignalGuard market state Redis cache");

        Ok(cleared_keys)
    }
}

fn market_state_key(symbol: &Symbol) -> String {
    format!("{MARKET_STATE_KEY_PREFIX}{}", symbol.as_str())
}

fn market_state_pattern() -> &'static str {
    "signalguard:market_state:*"
}

fn symbol_set_key() -> &'static str {
    SYMBOL_SET_KEY
}

fn redis_error(operation: &'static str) -> impl FnOnce(redis::RedisError) -> CacheError {
    move |source| CacheError::Redis { operation, source }
}

fn serialize<T: Serialize>(operation: &'static str, value: &T) -> Result<String, CacheError> {
    serde_json::to_string(value).map_err(|error| CacheError::Serialization {
        operation,
        source: error,
    })
}

fn deserialize<T: DeserializeOwned>(operation: &'static str, value: &str) -> Result<T, CacheError> {
    serde_json::from_str(value).map_err(|error| CacheError::Serialization {
        operation,
        source: error,
    })
}

fn deserialize_market_state_for_validation(
    operation: &'static str,
    symbol: &Symbol,
    value: &str,
) -> Result<MarketState, CacheError> {
    serde_json::from_str(value).map_err(|error| CacheError::InvalidData {
        operation,
        message: format!("market state for `{symbol}` is malformed: {error}"),
    })
}

fn lock_in_memory_states<'a>(
    states: &'a Arc<Mutex<HashMap<Symbol, MarketState>>>,
    operation: &'static str,
) -> Result<MutexGuard<'a, HashMap<Symbol, MarketState>>, CacheError> {
    states
        .lock()
        .map_err(|_| CacheError::InMemoryLock { operation })
}

#[cfg(test)]
fn lock_in_memory_symbols<'a>(
    symbols: &'a Arc<Mutex<Vec<Symbol>>>,
    operation: &'static str,
) -> Result<MutexGuard<'a, Vec<Symbol>>, CacheError> {
    symbols
        .lock()
        .map_err(|_| CacheError::InMemoryLock { operation })
}

impl RedisCache {
    #[cfg(test)]
    pub fn in_memory(states: Vec<MarketState>) -> Self {
        let states = states
            .into_iter()
            .map(|state| (state.symbol.clone(), state))
            .collect::<HashMap<_, _>>();

        Self {
            client: None,
            connection: None,
            in_memory_states: Some(Arc::new(Mutex::new(states))),
            in_memory_symbols: None,
            forced_failure: None,
        }
    }

    #[cfg(test)]
    pub fn in_memory_with_symbols(symbols: Vec<Symbol>, states: Vec<MarketState>) -> Self {
        let states = states
            .into_iter()
            .map(|state| (state.symbol.clone(), state))
            .collect::<HashMap<_, _>>();

        Self {
            client: None,
            connection: None,
            in_memory_states: Some(Arc::new(Mutex::new(states))),
            in_memory_symbols: Some(Arc::new(Mutex::new(symbols))),
            forced_failure: None,
        }
    }

    #[cfg(test)]
    pub fn in_memory_symbols_only(symbols: Vec<Symbol>) -> Self {
        Self {
            client: None,
            connection: None,
            in_memory_states: None,
            in_memory_symbols: Some(Arc::new(Mutex::new(symbols))),
            forced_failure: None,
        }
    }

    async fn registered_symbol_values(
        &self,
        operation: &'static str,
    ) -> Result<Vec<String>, CacheError> {
        #[cfg(test)]
        if let Some(symbols) = &self.in_memory_symbols {
            return Ok(lock_in_memory_symbols(symbols, operation)?
                .iter()
                .map(|symbol| symbol.as_str().to_owned())
                .collect());
        }

        if let Some(states) = &self.in_memory_states {
            return Ok(lock_in_memory_states(states, operation)?
                .keys()
                .map(|symbol| symbol.as_str().to_owned())
                .collect());
        }

        let mut connection = self.connection_for(operation).await?;
        connection
            .smembers(SYMBOL_SET_KEY)
            .await
            .map_err(redis_error(operation))
    }

    async fn market_state_payload(
        &self,
        symbol: &Symbol,
        operation: &'static str,
    ) -> Result<Option<String>, CacheError> {
        if let Some(states) = &self.in_memory_states {
            return lock_in_memory_states(states, operation)?
                .get(symbol)
                .map(|state| serialize(operation, state))
                .transpose();
        }

        #[cfg(test)]
        if self.in_memory_symbols.is_some() {
            return Ok(None);
        }

        let mut connection = self.connection_for(operation).await?;
        connection
            .get(market_state_key(symbol))
            .await
            .map_err(redis_error(operation))
    }

    #[cfg(test)]
    fn fail_if_forced(&self, operation: &'static str) -> Result<(), CacheError> {
        if self.forced_failure == Some(operation) {
            return Err(CacheError::InvalidData {
                operation,
                message: String::from("forced test failure"),
            });
        }

        Ok(())
    }

    #[cfg(not(test))]
    fn fail_if_forced(&self, _operation: &'static str) -> Result<(), CacheError> {
        Ok(())
    }

    #[cfg(test)]
    pub fn in_memory_with_entries(
        symbols: Vec<Symbol>,
        entries: Vec<(Symbol, MarketState)>,
    ) -> Self {
        Self {
            client: None,
            connection: None,
            in_memory_states: Some(Arc::new(Mutex::new(entries.into_iter().collect()))),
            in_memory_symbols: Some(Arc::new(Mutex::new(symbols))),
            forced_failure: None,
        }
    }

    #[cfg(test)]
    pub fn with_forced_failure(mut self, operation: &'static str) -> Self {
        self.forced_failure = Some(operation);
        self
    }

    fn client(&self) -> Result<&redis::Client, CacheError> {
        self.client.as_ref().ok_or(CacheError::Unavailable)
    }

    async fn connection_for(
        &self,
        operation: &'static str,
    ) -> Result<redis::aio::MultiplexedConnection, CacheError> {
        if let Some(connection) = &self.connection {
            return Ok(connection.clone());
        }

        self.client()?
            .get_multiplexed_async_connection()
            .await
            .map_err(redis_error(operation))
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::OnceLock,
        time::{SystemTime, UNIX_EPOCH},
    };

    use redis::AsyncCommands;
    use rust_decimal::Decimal;
    use tokio::sync::Mutex as AsyncMutex;

    use super::{
        CacheError, RedisCache, SYMBOL_SET_KEY, deserialize,
        deserialize_market_state_for_validation, market_state_key, market_state_pattern, serialize,
        symbol_set_key,
    };
    use crate::domain::{MarketState, Symbol};

    #[tokio::test]
    async fn unavailable_cache_returns_unavailable_error() {
        let cache = RedisCache::unavailable();
        let error = cache.list_symbols().await.unwrap_err().to_string();

        assert!(error.contains("redis cache is unavailable"));
    }

    #[tokio::test]
    async fn unavailable_cache_rejects_state_reads() {
        let cache = RedisCache::unavailable();
        let error = cache
            .get_market_state(&Symbol::new("BTCUSDT").unwrap())
            .await
            .unwrap_err();

        assert!(matches!(error, CacheError::Unavailable));
    }

    #[tokio::test]
    async fn unavailable_cache_rejects_state_writes() {
        let cache = RedisCache::unavailable();
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.last_trade_price = Some(Decimal::new(100, 0));

        let error = cache.set_market_state(&state).await.unwrap_err();

        assert!(matches!(error, CacheError::Unavailable));
    }

    #[tokio::test]
    async fn in_memory_cache_reports_missing_market_state() {
        let cache = RedisCache::in_memory(Vec::new());
        let state = cache
            .get_market_state(&Symbol::new("BTCUSDT").unwrap())
            .await
            .unwrap();

        assert!(state.is_none());
    }

    #[tokio::test]
    async fn in_memory_cache_can_list_symbols_without_state_entries() {
        let cache = RedisCache::in_memory_with_symbols(
            vec![
                Symbol::new("ETHUSDT").unwrap(),
                Symbol::new("BTCUSDT").unwrap(),
            ],
            Vec::new(),
        );
        let symbols = cache.list_symbols().await.unwrap();
        let missing_state = cache
            .get_market_state(&Symbol::new("BTCUSDT").unwrap())
            .await
            .unwrap();

        assert_eq!(symbols[0].as_str(), "BTCUSDT");
        assert_eq!(symbols[1].as_str(), "ETHUSDT");
        assert!(missing_state.is_none());
    }

    #[tokio::test]
    async fn in_memory_symbols_only_leaves_state_reads_unavailable() {
        let cache = RedisCache::in_memory_symbols_only(vec![Symbol::new("BTCUSDT").unwrap()]);
        let symbols = cache.list_symbols().await.unwrap();
        let error = cache
            .get_market_state(&Symbol::new("BTCUSDT").unwrap())
            .await
            .unwrap_err();

        assert_eq!(symbols[0].as_str(), "BTCUSDT");
        assert!(matches!(error, CacheError::Unavailable));
    }

    #[tokio::test]
    async fn validation_accepts_empty_in_memory_cache() {
        let cache = RedisCache::in_memory(Vec::new());

        let validated_symbols = cache.validate_market_state_cache().await.unwrap();

        assert_eq!(validated_symbols, 0);
    }

    #[tokio::test]
    async fn validation_rejects_registered_symbol_without_state() {
        let cache =
            RedisCache::in_memory_with_symbols(vec![Symbol::new("BTCUSDT").unwrap()], Vec::new());

        let error = cache.validate_market_state_cache().await.unwrap_err();

        assert!(matches!(error, CacheError::InvalidData { .. }));
        assert!(
            error
                .to_string()
                .contains("has no corresponding market-state value")
        );
    }

    #[tokio::test]
    async fn validation_rejects_embedded_symbol_mismatch() {
        let key_symbol = Symbol::new("BTCUSDT").unwrap();
        let state = MarketState::new(Symbol::new("ETHUSDT").unwrap());
        let cache =
            RedisCache::in_memory_with_entries(vec![key_symbol.clone()], vec![(key_symbol, state)]);

        let error = cache.validate_market_state_cache().await.unwrap_err();

        assert!(matches!(error, CacheError::InvalidData { .. }));
        assert!(
            error
                .to_string()
                .contains("contains embedded symbol `ETHUSDT`")
        );
    }

    #[test]
    fn validation_rejects_malformed_market_state_payload() {
        let symbol = Symbol::new("BTCUSDT").unwrap();

        let error = deserialize_market_state_for_validation(
            "validate_market_state_cache",
            &symbol,
            "{not-json",
        )
        .unwrap_err();

        assert!(matches!(error, CacheError::InvalidData { .. }));
        assert!(
            error
                .to_string()
                .contains("market state for `BTCUSDT` is malformed")
        );
    }

    #[test]
    fn market_state_cache_cleanup_targets_only_signalguard_keys() {
        assert_eq!(symbol_set_key(), "signalguard:symbols");
        assert_eq!(market_state_pattern(), "signalguard:market_state:*");
    }

    #[test]
    fn market_state_with_depth_fields_serializes_for_cache_round_trip() {
        let mut state = MarketState::new(Symbol::new("BTCUSDT").unwrap());
        state.top_bid_quantity = Some(Decimal::new(120, 2));
        state.top_ask_quantity = Some(Decimal::new(80, 2));
        state.top_bid_liquidity = Some(Decimal::new(7805760, 2));
        state.top_ask_liquidity = Some(Decimal::new(5204400, 2));
        state.book_imbalance = Some(Decimal::new(2, 1));
        state.depth_sequence_gap_count = 3;

        let payload = serialize("test_market_state", &state).unwrap();
        let decoded: MarketState = deserialize("test_market_state", &payload).unwrap();

        assert_eq!(decoded, state);
    }

    #[tokio::test]
    #[ignore = "requires local Redis via REDIS_URL"]
    async fn atomic_market_state_write_updates_payload_and_symbol_once() {
        let _guard = redis_integration_test_lock().lock().await;
        let (cache, redis_url) = redis_integration_cache().await;
        cache.clear_market_state_cache().await.unwrap();

        let symbol = unique_test_symbol("ATOMOK");
        let state_key = market_state_key(&symbol);
        let unrelated_key = unique_unrelated_key();
        let client = redis::Client::open(redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let (): () = connection.set(&unrelated_key, "keep-me").await.unwrap();

        let mut first = MarketState::new(symbol.clone());
        first.last_trade_price = Some(Decimal::new(6500010, 2));
        cache.set_market_state(&first).await.unwrap();

        let first_payload: Option<String> = connection.get(&state_key).await.unwrap();
        assert_eq!(
            first_payload,
            Some(serialize("set_market_state", &first).unwrap())
        );
        let registered: bool = connection
            .sismember(SYMBOL_SET_KEY, symbol.as_str())
            .await
            .unwrap();
        assert!(registered);
        assert_eq!(cache.get_market_state(&symbol).await.unwrap(), Some(first));
        assert!(cache.list_symbols().await.unwrap().contains(&symbol));

        let mut replacement = MarketState::new(symbol.clone());
        replacement.last_trade_price = Some(Decimal::new(6600010, 2));
        cache.set_market_state(&replacement).await.unwrap();

        let replacement_payload: Option<String> = connection.get(&state_key).await.unwrap();
        assert_eq!(
            replacement_payload,
            Some(serialize("set_market_state", &replacement).unwrap())
        );
        let membership_count: usize = connection.scard(SYMBOL_SET_KEY).await.unwrap();
        assert_eq!(membership_count, 1);
        assert_eq!(
            cache.get_market_state(&symbol).await.unwrap(),
            Some(replacement)
        );
        assert_eq!(
            connection
                .get::<_, Option<String>>(&unrelated_key)
                .await
                .unwrap(),
            Some(String::from("keep-me"))
        );

        let deleted: usize = connection.del(&unrelated_key).await.unwrap();
        assert_eq!(deleted, 1);
        cache.clear_market_state_cache().await.unwrap();
    }

    #[tokio::test]
    #[ignore = "requires local Redis via REDIS_URL"]
    async fn atomic_market_state_write_rejects_wrong_symbols_type_without_state_write() {
        let _guard = redis_integration_test_lock().lock().await;
        let (cache, redis_url) = redis_integration_cache().await;
        cache.clear_market_state_cache().await.unwrap();

        let symbol = unique_test_symbol("BADIDX");
        let state = MarketState::new(symbol.clone());
        let state_key = market_state_key(&symbol);
        let client = redis::Client::open(redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let invalid_index = "not-a-set";
        let (): () = connection.set(SYMBOL_SET_KEY, invalid_index).await.unwrap();

        let error = cache.set_market_state(&state).await.unwrap_err();

        assert!(matches!(error, CacheError::Redis { .. }));
        assert!(error.to_string().contains("set_market_state"));
        assert!(
            error
                .to_string()
                .contains("symbols key has incompatible type: string")
        );
        assert_eq!(
            connection
                .get::<_, Option<String>>(SYMBOL_SET_KEY)
                .await
                .unwrap(),
            Some(String::from(invalid_index))
        );
        assert_eq!(
            connection
                .get::<_, Option<String>>(&state_key)
                .await
                .unwrap(),
            None
        );
        let state_key_type: String = redis::cmd("TYPE")
            .arg(&state_key)
            .query_async(&mut connection)
            .await
            .unwrap();
        assert_eq!(state_key_type, "none");

        cache.clear_market_state_cache().await.unwrap();
    }

    #[tokio::test]
    #[ignore = "requires local Redis via REDIS_URL"]
    async fn atomic_market_state_write_rejects_wrong_state_type_without_symbol_write() {
        let _guard = redis_integration_test_lock().lock().await;
        let (cache, redis_url) = redis_integration_cache().await;
        cache.clear_market_state_cache().await.unwrap();

        let symbol = unique_test_symbol("BADSTATE");
        let state = MarketState::new(symbol.clone());
        let state_key = market_state_key(&symbol);
        let client = redis::Client::open(redis_url.as_str()).unwrap();
        let mut connection = client.get_multiplexed_async_connection().await.unwrap();
        let added: usize = connection.sadd(&state_key, "keep-me").await.unwrap();
        assert_eq!(added, 1);

        let error = cache.set_market_state(&state).await.unwrap_err();

        assert!(matches!(error, CacheError::Redis { .. }));
        assert!(error.to_string().contains("set_market_state"));
        assert!(
            error
                .to_string()
                .contains("market state key has incompatible type: set")
        );
        let preserved_state_members: Vec<String> = connection.smembers(&state_key).await.unwrap();
        assert_eq!(preserved_state_members, vec![String::from("keep-me")]);
        let registered: bool = connection
            .sismember(SYMBOL_SET_KEY, symbol.as_str())
            .await
            .unwrap();
        assert!(!registered);
        let symbols_key_type: String = redis::cmd("TYPE")
            .arg(SYMBOL_SET_KEY)
            .query_async(&mut connection)
            .await
            .unwrap();
        assert_eq!(symbols_key_type, "none");

        cache.clear_market_state_cache().await.unwrap();
    }

    async fn redis_integration_cache() -> (RedisCache, String) {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| {
            panic!(
                "REDIS_URL is required for Redis integration tests; start an isolated Redis and run `cargo test --lib atomic_market_state_write -- --ignored`"
            )
        });
        let cache = RedisCache::connect(&redis_url)
            .await
            .unwrap_or_else(|error| {
                panic!("failed to connect to Redis integration cache: {error}")
            });

        (cache, redis_url)
    }

    fn redis_integration_test_lock() -> &'static AsyncMutex<()> {
        static LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| AsyncMutex::new(()))
    }

    fn unique_test_symbol(prefix: &str) -> Symbol {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        Symbol::new(format!("SG{prefix}{unique_suffix}")).unwrap()
    }

    fn unique_unrelated_key() -> String {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("integration:unrelated:{unique_suffix}")
    }
}

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

#[derive(Clone, Debug)]
pub struct RedisCache {
    client: Option<redis::Client>,
    connection: Option<redis::aio::MultiplexedConnection>,
    in_memory_states: Option<Arc<Mutex<HashMap<Symbol, MarketState>>>>,
    #[cfg(test)]
    in_memory_symbols: Option<Arc<Mutex<Vec<Symbol>>>>,
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
        })
    }

    pub fn unavailable() -> Self {
        Self {
            client: None,
            connection: None,
            in_memory_states: None,
            #[cfg(test)]
            in_memory_symbols: None,
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

        let (): () = connection
            .set(&key, payload)
            .await
            .map_err(redis_error(operation))?;
        let (): () = connection
            .sadd(SYMBOL_SET_KEY, state.symbol.as_str())
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

    pub async fn clear_market_state_cache(&self) -> Result<usize, CacheError> {
        let operation = "clear_market_state_cache";
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
        }
    }

    #[cfg(test)]
    pub fn in_memory_symbols_only(symbols: Vec<Symbol>) -> Self {
        Self {
            client: None,
            connection: None,
            in_memory_states: None,
            in_memory_symbols: Some(Arc::new(Mutex::new(symbols))),
        }
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
    use rust_decimal::Decimal;

    use super::{
        CacheError, RedisCache, deserialize, market_state_pattern, serialize, symbol_set_key,
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
}

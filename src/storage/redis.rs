use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
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
    in_memory_states: Option<Arc<Mutex<HashMap<Symbol, MarketState>>>>,
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
}

impl RedisCache {
    pub async fn connect(redis_url: &str) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        let mut connection = client.get_multiplexed_async_connection().await?;
        let _: String = redis::cmd("PING").query_async(&mut connection).await?;

        Ok(Self {
            client: Some(client),
            in_memory_states: None,
        })
    }

    pub fn unavailable() -> Self {
        Self {
            client: None,
            in_memory_states: None,
        }
    }

    pub fn is_available(&self) -> bool {
        self.client.is_some() || self.in_memory_states.is_some()
    }

    pub async fn set_market_state(&self, state: &MarketState) -> Result<(), CacheError> {
        if let Some(states) = &self.in_memory_states {
            states
                .lock()
                .expect("in-memory Redis test cache mutex poisoned")
                .insert(state.symbol.clone(), state.clone());
            return Ok(());
        }

        let key = market_state_key(&state.symbol);
        let payload = serialize("set_market_state", state)?;
        let client = self.client()?;
        let mut connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|error| CacheError::Redis {
                operation: "set_market_state",
                source: error,
            })?;

        let (): () = connection
            .set(&key, payload)
            .await
            .map_err(|error| CacheError::Redis {
                operation: "set_market_state",
                source: error,
            })?;
        let (): () = connection
            .sadd(SYMBOL_SET_KEY, state.symbol.as_str())
            .await
            .map_err(|error| CacheError::Redis {
                operation: "set_market_state",
                source: error,
            })?;

        Ok(())
    }

    pub async fn get_market_state(
        &self,
        symbol: &Symbol,
    ) -> Result<Option<MarketState>, CacheError> {
        if let Some(states) = &self.in_memory_states {
            return Ok(states
                .lock()
                .expect("in-memory Redis test cache mutex poisoned")
                .get(symbol)
                .cloned());
        }

        let client = self.client()?;
        let mut connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|error| CacheError::Redis {
                operation: "get_market_state",
                source: error,
            })?;
        let payload: Option<String> =
            connection
                .get(market_state_key(symbol))
                .await
                .map_err(|error| CacheError::Redis {
                    operation: "get_market_state",
                    source: error,
                })?;

        payload
            .map(|json| deserialize("get_market_state", &json))
            .transpose()
    }

    pub async fn list_symbols(&self) -> Result<Vec<Symbol>, CacheError> {
        if let Some(states) = &self.in_memory_states {
            let mut symbols = states
                .lock()
                .expect("in-memory Redis test cache mutex poisoned")
                .keys()
                .cloned()
                .collect::<Vec<_>>();
            symbols.sort();
            return Ok(symbols);
        }

        let client = self.client()?;
        let mut connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|error| CacheError::Redis {
                operation: "list_symbols",
                source: error,
            })?;
        let raw_symbols: Vec<String> =
            connection
                .smembers(SYMBOL_SET_KEY)
                .await
                .map_err(|error| CacheError::Redis {
                    operation: "list_symbols",
                    source: error,
                })?;

        let mut symbols = raw_symbols
            .into_iter()
            .map(|raw_symbol| {
                Symbol::new(raw_symbol).map_err(|error| CacheError::InvalidData {
                    operation: "list_symbols",
                    message: error.to_string(),
                })
            })
            .collect::<Result<Vec<_>, _>>()?;
        symbols.sort();

        Ok(symbols)
    }

    pub async fn clear_market_state_cache(&self) -> Result<usize, CacheError> {
        if let Some(states) = &self.in_memory_states {
            let mut states = states
                .lock()
                .expect("in-memory Redis test cache mutex poisoned");
            let cleared_keys = states.len();
            states.clear();
            return Ok(cleared_keys);
        }

        let client = self.client()?;
        let mut connection = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|error| CacheError::Redis {
                operation: "clear_market_state_cache",
                source: error,
            })?;
        let mut cursor = 0u64;
        let mut keys_to_clear = Vec::new();
        loop {
            let (next_cursor, mut batch): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(market_state_pattern())
                .query_async(&mut connection)
                .await
                .map_err(|error| CacheError::Redis {
                    operation: "clear_market_state_cache",
                    source: error,
                })?;
            keys_to_clear.append(&mut batch);
            cursor = next_cursor;
            if cursor == 0 {
                break;
            }
        }

        keys_to_clear.push(symbol_set_key().to_owned());

        let cleared_keys =
            connection
                .del(keys_to_clear)
                .await
                .map_err(|error| CacheError::Redis {
                    operation: "clear_market_state_cache",
                    source: error,
                })?;

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

impl RedisCache {
    #[cfg(test)]
    pub fn in_memory(states: Vec<MarketState>) -> Self {
        let states = states
            .into_iter()
            .map(|state| (state.symbol.clone(), state))
            .collect::<HashMap<_, _>>();

        Self {
            client: None,
            in_memory_states: Some(Arc::new(Mutex::new(states))),
        }
    }

    fn client(&self) -> Result<&redis::Client, CacheError> {
        self.client.as_ref().ok_or(CacheError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;

    use super::{CacheError, RedisCache, market_state_pattern, symbol_set_key};
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

    #[test]
    fn market_state_cache_cleanup_targets_only_signalguard_keys() {
        assert_eq!(symbol_set_key(), "signalguard:symbols");
        assert_eq!(market_state_pattern(), "signalguard:market_state:*");
    }
}

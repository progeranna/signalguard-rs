use tracing::{info, warn};

use crate::{config::IngestionMode, storage::RedisCache, telemetry::InternalCounters};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MarketStateStartupPolicy {
    PreserveAndValidate,
    Reset,
}

impl MarketStateStartupPolicy {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PreserveAndValidate => "preserve_and_validate",
            Self::Reset => "reset",
        }
    }
}

pub fn resolve_market_state_startup_policy(
    ingestion_mode: IngestionMode,
    replay_reset_state: bool,
) -> MarketStateStartupPolicy {
    match ingestion_mode {
        IngestionMode::Live => MarketStateStartupPolicy::PreserveAndValidate,
        IngestionMode::Replay if replay_reset_state => MarketStateStartupPolicy::Reset,
        IngestionMode::Replay => MarketStateStartupPolicy::PreserveAndValidate,
    }
}

pub async fn prepare_market_state_cache(
    redis_cache: Option<RedisCache>,
    policy: MarketStateStartupPolicy,
    counters: &InternalCounters,
) -> RedisCache {
    let Some(cache) = redis_cache else {
        return RedisCache::unavailable();
    };
    if !cache.is_available() {
        return RedisCache::unavailable();
    }

    match policy {
        MarketStateStartupPolicy::PreserveAndValidate => {
            match cache.validate_market_state_cache().await {
                Ok(validated_symbols) => {
                    info!(
                        policy = policy.as_str(),
                        validated_symbols,
                        "preserved and validated SignalGuard market state Redis cache"
                    );
                    cache
                }
                Err(error) => {
                    counters.increment_cache_errors();
                    warn!(
                        %error,
                        policy = policy.as_str(),
                        "failed to validate preserved Redis market state cache; continuing in degraded mode without deleting cache data"
                    );
                    RedisCache::unavailable()
                }
            }
        }
        MarketStateStartupPolicy::Reset => match cache.clear_market_state_cache().await {
            Ok(cleared_keys) => {
                info!(
                    policy = policy.as_str(),
                    cleared_keys,
                    "reset SignalGuard market state Redis cache before ingestion startup"
                );
                cache
            }
            Err(error) => {
                counters.increment_cache_errors();
                warn!(
                    %error,
                    policy = policy.as_str(),
                    "failed to reset Redis market state cache; continuing in degraded mode"
                );
                RedisCache::unavailable()
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::{
        MarketStateStartupPolicy, prepare_market_state_cache, resolve_market_state_startup_policy,
    };
    use crate::{
        config::IngestionMode,
        domain::{MarketState, Symbol},
        storage::RedisCache,
        telemetry::InternalCounters,
    };

    #[test]
    fn live_resolves_to_preserve_and_validate() {
        assert_eq!(
            resolve_market_state_startup_policy(IngestionMode::Live, false),
            MarketStateStartupPolicy::PreserveAndValidate
        );
    }

    #[test]
    fn live_ignores_replay_reset_state_setting() {
        assert_eq!(
            resolve_market_state_startup_policy(IngestionMode::Live, true),
            MarketStateStartupPolicy::PreserveAndValidate
        );
        assert_eq!(
            resolve_market_state_startup_policy(IngestionMode::Live, false),
            MarketStateStartupPolicy::PreserveAndValidate
        );
    }

    #[test]
    fn replay_with_reset_state_resolves_to_reset() {
        assert_eq!(
            resolve_market_state_startup_policy(IngestionMode::Replay, true),
            MarketStateStartupPolicy::Reset
        );
    }

    #[test]
    fn replay_without_reset_state_resolves_to_preserve_and_validate() {
        assert_eq!(
            resolve_market_state_startup_policy(IngestionMode::Replay, false),
            MarketStateStartupPolicy::PreserveAndValidate
        );
    }

    #[tokio::test]
    async fn preserve_policy_keeps_existing_state_and_symbol_set() {
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let state = MarketState::new(symbol.clone());
        let cache = RedisCache::in_memory_with_symbols(vec![symbol.clone()], vec![state.clone()]);
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache.clone()),
            MarketStateStartupPolicy::PreserveAndValidate,
            &counters,
        )
        .await;

        assert!(prepared.is_available());
        assert_eq!(prepared.list_symbols().await.unwrap(), vec![symbol.clone()]);
        assert_eq!(
            prepared.get_market_state(&symbol).await.unwrap(),
            Some(state)
        );
        assert_eq!(cache_errors(&counters), 0);
    }

    #[tokio::test]
    async fn preserve_policy_accepts_empty_cache() {
        let cache = RedisCache::in_memory(Vec::new());
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache),
            MarketStateStartupPolicy::PreserveAndValidate,
            &counters,
        )
        .await;

        assert!(prepared.is_available());
        assert!(prepared.list_symbols().await.unwrap().is_empty());
        assert_eq!(cache_errors(&counters), 0);
    }

    #[tokio::test]
    async fn reset_policy_clears_states_and_symbol_set() {
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let cache = RedisCache::in_memory_with_symbols(
            vec![symbol.clone()],
            vec![MarketState::new(symbol.clone())],
        );
        let counters = InternalCounters::default();

        let prepared =
            prepare_market_state_cache(Some(cache), MarketStateStartupPolicy::Reset, &counters)
                .await;

        assert!(prepared.is_available());
        assert!(prepared.list_symbols().await.unwrap().is_empty());
        assert!(prepared.get_market_state(&symbol).await.unwrap().is_none());
        assert_eq!(cache_errors(&counters), 0);
    }

    #[tokio::test]
    async fn missing_registered_state_degrades_without_deleting_symbol_set() {
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let cache = RedisCache::in_memory_with_symbols(vec![symbol.clone()], Vec::new());
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache.clone()),
            MarketStateStartupPolicy::PreserveAndValidate,
            &counters,
        )
        .await;

        assert!(!prepared.is_available());
        assert_eq!(cache.list_symbols().await.unwrap(), vec![symbol]);
        assert_eq!(cache_errors(&counters), 1);
    }

    #[tokio::test]
    async fn embedded_symbol_mismatch_degrades_without_mutating_cache() {
        let key_symbol = Symbol::new("BTCUSDT").unwrap();
        let embedded_symbol = Symbol::new("ETHUSDT").unwrap();
        let state = MarketState::new(embedded_symbol.clone());
        let cache = RedisCache::in_memory_with_entries(
            vec![key_symbol.clone()],
            vec![(key_symbol.clone(), state.clone())],
        );
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache.clone()),
            MarketStateStartupPolicy::PreserveAndValidate,
            &counters,
        )
        .await;

        assert!(!prepared.is_available());
        assert_eq!(
            cache.get_market_state(&key_symbol).await.unwrap(),
            Some(state)
        );
        assert_eq!(cache.list_symbols().await.unwrap(), vec![key_symbol]);
        assert_eq!(cache_errors(&counters), 1);
    }

    #[tokio::test]
    async fn validation_failure_degrades_and_counts_once() {
        let cache =
            RedisCache::in_memory(Vec::new()).with_forced_failure("validate_market_state_cache");
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache),
            MarketStateStartupPolicy::PreserveAndValidate,
            &counters,
        )
        .await;

        assert!(!prepared.is_available());
        assert_eq!(cache_errors(&counters), 1);
    }

    #[tokio::test]
    async fn reset_failure_degrades_and_counts_once() {
        let symbol = Symbol::new("BTCUSDT").unwrap();
        let cache = RedisCache::in_memory(vec![MarketState::new(symbol.clone())])
            .with_forced_failure("clear_market_state_cache");
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(cache.clone()),
            MarketStateStartupPolicy::Reset,
            &counters,
        )
        .await;

        assert!(!prepared.is_available());
        assert!(cache.get_market_state(&symbol).await.unwrap().is_some());
        assert_eq!(cache_errors(&counters), 1);
    }

    #[tokio::test]
    async fn unavailable_connection_is_not_validated_or_cleared() {
        let counters = InternalCounters::default();

        let prepared = prepare_market_state_cache(
            Some(RedisCache::unavailable()),
            MarketStateStartupPolicy::Reset,
            &counters,
        )
        .await;

        assert!(!prepared.is_available());
        assert_eq!(cache_errors(&counters), 0);
    }

    fn cache_errors(counters: &InternalCounters) -> u64 {
        counters.snapshot_at(Utc::now()).cache_errors
    }
}

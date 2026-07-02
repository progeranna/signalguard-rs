use anyhow::{Context, Result};
use signalguard_rs::{
    api::{self, AppState},
    config::Settings,
    runtime::RuntimeModeHandle,
    runtime_supervisor::IngestionSupervisor,
    storage::{self, RedisCache},
    telemetry::{self, InternalCounters},
};
use sqlx::PgPool;
use tokio::sync::watch;
use tracing::error;
use tracing::info;
use tracing::warn;

#[tokio::main]
async fn main() -> Result<()> {
    telemetry::init();
    let counters = InternalCounters::default();

    let settings = Settings::load().context("failed to load application settings")?;
    let address = settings
        .server
        .socket_address()
        .context("failed to resolve server bind address")?;
    let postgres_pool = initialize_postgres(&settings).await?;
    let redis_cache = initialize_redis(&settings, &counters).await;

    let listener = tokio::net::TcpListener::bind(address)
        .await
        .with_context(|| format!("failed to bind HTTP server to {address}"))?;

    let redis_cache = clear_market_state_cache(redis_cache, &counters).await;
    let supervisor = IngestionSupervisor::new(
        &settings.ingestion,
        &settings.binance,
        &settings.detectors,
        postgres_pool.clone(),
        redis_cache.clone(),
        counters.clone(),
    );
    let app_state = build_app_state(
        &postgres_pool,
        &redis_cache,
        &settings,
        &counters,
        supervisor.runtime_mode_handle(),
    );

    log_startup(&settings);

    let (shutdown_tx, _shutdown_rx) = watch::channel(false);
    supervisor.start_initial().await?;

    axum::serve(listener, api::router(app_state))
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await
        .context("HTTP server exited with an error")?;

    supervisor.shutdown().await?;

    Ok(())
}

async fn initialize_postgres(settings: &Settings) -> Result<PgPool> {
    storage::postgres::connect_pool(&settings.database.url)
        .await
        .context("failed to initialize PostgreSQL storage")
}

async fn initialize_redis(settings: &Settings, counters: &InternalCounters) -> Option<RedisCache> {
    match RedisCache::connect(&settings.redis.url).await {
        Ok(cache) => Some(cache),
        Err(error) => {
            counters.increment_cache_errors();
            warn!(%error, "Redis cache unavailable; continuing in degraded mode");
            None
        }
    }
}

async fn clear_market_state_cache(
    redis_cache: Option<RedisCache>,
    counters: &InternalCounters,
) -> RedisCache {
    let Some(cache) = redis_cache else {
        return RedisCache::unavailable();
    };

    match cache.clear_market_state_cache().await {
        Ok(_) => cache,
        Err(error) => {
            counters.increment_cache_errors();
            warn!(%error, "failed to clear Redis market state cache; continuing in degraded mode");
            RedisCache::unavailable()
        }
    }
}

fn build_app_state(
    postgres_pool: &PgPool,
    redis_cache: &RedisCache,
    settings: &Settings,
    counters: &InternalCounters,
    runtime_mode: RuntimeModeHandle,
) -> AppState {
    AppState {
        pg_pool: postgres_pool.clone(),
        redis_cache: redis_cache.clone(),
        detector_settings: settings.detectors.clone(),
        health_settings: settings.health.clone(),
        runtime_mode,
        counters: counters.clone(),
    }
}

fn log_startup(settings: &Settings) {
    info!(
        service = "signalguard-rs",
        host = %settings.server.host,
        port = settings.server.port,
        ingestion_mode = settings.ingestion.mode.as_str(),
        configured_symbols = settings.ingestion.symbols.len(),
        replay_path = %settings.ingestion.replay_path.display(),
        replay_reset_storage = settings.ingestion.replay_reset_storage,
        event_channel_capacity = settings.ingestion.event_channel_capacity,
        binance_websocket_base_url = %settings.binance.websocket_base_url,
        database_url_configured = !settings.database.url.trim().is_empty(),
        redis_url_configured = !settings.redis.url.trim().is_empty(),
        "starting HTTP server"
    );
}

async fn shutdown_signal(shutdown_tx: watch::Sender<bool>) {
    match tokio::signal::ctrl_c().await {
        Ok(()) => {
            let _ = shutdown_tx.send(true);
            info!("shutdown signal received");
        }
        Err(error) => error!(%error, "failed to listen for shutdown signal"),
    }
}

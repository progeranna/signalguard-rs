use anyhow::{Context, Result};
use chrono::Utc;
use signalguard_rs::{
    api::{self, AppState},
    config::{IngestionMode, Settings},
    ingestion,
    runtime::RuntimeModeSnapshot,
    storage::{self, RedisCache},
    telemetry::{self, InternalCounters},
};
use sqlx::PgPool;
use tokio::{sync::watch, task::JoinHandle};
use tracing::error;
use tracing::info;
use tracing::warn;

type LiveIngestionTask = JoinHandle<Result<ingestion::LiveRunReport>>;

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
    let app_state = build_app_state(&postgres_pool, &redis_cache, &settings, &counters);

    log_startup(&settings);

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let live_ingestion_task = start_ingestion(
        &settings,
        postgres_pool.clone(),
        redis_cache.clone(),
        counters.clone(),
        shutdown_rx,
    )
    .await?;

    axum::serve(listener, api::router(app_state))
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await
        .context("HTTP server exited with an error")?;

    if let Some(task) = live_ingestion_task {
        wait_for_live_ingestion(task).await?;
    }

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
) -> AppState {
    let started_at = Utc::now();

    AppState {
        pg_pool: postgres_pool.clone(),
        redis_cache: redis_cache.clone(),
        detector_settings: settings.detectors.clone(),
        health_settings: settings.health.clone(),
        runtime_mode: RuntimeModeSnapshot::from_startup_config(
            settings.ingestion.mode,
            &settings.ingestion.symbols,
            started_at,
        ),
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

async fn start_ingestion(
    settings: &Settings,
    postgres_pool: PgPool,
    redis_cache: RedisCache,
    counters: InternalCounters,
    shutdown_rx: watch::Receiver<bool>,
) -> Result<Option<LiveIngestionTask>> {
    match settings.ingestion.mode {
        IngestionMode::Replay => {
            run_replay_mode(settings, postgres_pool, redis_cache, counters).await?;
            Ok(None)
        }
        IngestionMode::Live => Ok(Some(spawn_live_ingestion(
            settings,
            postgres_pool,
            redis_cache,
            counters,
            shutdown_rx,
        ))),
    }
}

async fn run_replay_mode(
    settings: &Settings,
    postgres_pool: PgPool,
    redis_cache: RedisCache,
    counters: InternalCounters,
) -> Result<()> {
    reset_replay_storage_if_needed(settings, &postgres_pool).await?;
    ingestion::run_replay_ingestion(
        &settings.ingestion,
        postgres_pool,
        redis_cache,
        settings.detectors.clone(),
        counters,
    )
    .await
    .context("failed to run replay ingestion")?;

    Ok(())
}

async fn reset_replay_storage_if_needed(settings: &Settings, postgres_pool: &PgPool) -> Result<()> {
    if settings.ingestion.replay_reset_storage {
        info!("replay storage reset enabled; clearing PostgreSQL demo history before ingestion");
        storage::postgres::reset_replay_storage(postgres_pool)
            .await
            .context("failed to reset replay historical tables")?;
    } else {
        info!("replay storage reset disabled; preserving existing PostgreSQL history");
    }

    Ok(())
}

fn spawn_live_ingestion(
    settings: &Settings,
    postgres_pool: PgPool,
    redis_cache: RedisCache,
    counters: InternalCounters,
    shutdown_rx: watch::Receiver<bool>,
) -> LiveIngestionTask {
    let ingestion_settings = settings.ingestion.clone();
    let binance_settings = settings.binance.clone();
    let detector_settings = settings.detectors.clone();
    tokio::spawn(async move {
        ingestion::run_live_ingestion(
            &ingestion_settings,
            &binance_settings,
            postgres_pool,
            redis_cache,
            detector_settings,
            counters,
            shutdown_rx,
        )
        .await
    })
}

async fn wait_for_live_ingestion(task: LiveIngestionTask) -> Result<()> {
    task.await
        .context("live ingestion task failed to join")?
        .context("live ingestion task exited with an error")?;

    Ok(())
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

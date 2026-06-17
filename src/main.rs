use anyhow::{Context, Result};
use signalguard_rs::{
    api::{self, AppState},
    config::{IngestionMode, Settings},
    ingestion,
    storage::{self, RedisCache},
    telemetry::{self, InternalCounters},
};
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
    let postgres_pool = storage::postgres::connect_pool(&settings.database.url)
        .await
        .context("failed to initialize PostgreSQL storage")?;
    let redis_cache = match RedisCache::connect(&settings.redis.url).await {
        Ok(cache) => match cache.clear_market_state_cache().await {
            Ok(_) => cache,
            Err(error) => {
                counters.increment_cache_errors();
                warn!(%error, "failed to clear Redis market state cache; continuing in degraded mode");
                RedisCache::unavailable()
            }
        },
        Err(error) => {
            counters.increment_cache_errors();
            warn!(%error, "Redis cache unavailable; continuing in degraded mode");
            RedisCache::unavailable()
        }
    };
    let app_state = AppState {
        pg_pool: postgres_pool.clone(),
        redis_cache: redis_cache.clone(),
        detector_settings: settings.detectors.clone(),
        health_settings: settings.health.clone(),
        counters: counters.clone(),
    };

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

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let live_ingestion_task = match settings.ingestion.mode {
        IngestionMode::Replay => {
            if settings.ingestion.replay_reset_storage {
                info!(
                    "replay storage reset enabled; clearing PostgreSQL demo history before ingestion"
                );
                storage::postgres::reset_replay_storage(&postgres_pool)
                    .await
                    .context("failed to reset replay historical tables")?;
            } else {
                info!("replay storage reset disabled; preserving existing PostgreSQL history");
            }
            ingestion::run_replay_ingestion(
                &settings.ingestion,
                postgres_pool.clone(),
                redis_cache.clone(),
                settings.detectors.clone(),
                counters.clone(),
            )
            .await
            .context("failed to run replay ingestion")?;
            None
        }
        IngestionMode::Live => {
            let ingestion_settings = settings.ingestion.clone();
            let binance_settings = settings.binance.clone();
            let detector_settings = settings.detectors.clone();
            Some(tokio::spawn(async move {
                ingestion::run_live_ingestion(
                    &ingestion_settings,
                    &binance_settings,
                    postgres_pool.clone(),
                    redis_cache.clone(),
                    detector_settings,
                    counters.clone(),
                    shutdown_rx,
                )
                .await
            }))
        }
    };

    let listener = tokio::net::TcpListener::bind(address)
        .await
        .with_context(|| format!("failed to bind HTTP server to {address}"))?;

    axum::serve(listener, api::router(app_state))
        .with_graceful_shutdown(shutdown_signal(shutdown_tx))
        .await
        .context("HTTP server exited with an error")?;

    if let Some(task) = live_ingestion_task {
        task.await
            .context("live ingestion task failed to join")?
            .context("live ingestion task exited with an error")?;
    }

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

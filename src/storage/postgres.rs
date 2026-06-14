use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::{PgPool, postgres::PgPoolOptions};
use tracing::info;

pub async fn connect_pool(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
        .with_context(|| "failed to connect to PostgreSQL using SIGNALGUARD_DATABASE_URL")?;

    info!("PostgreSQL storage initialized");

    Ok(pool)
}

pub async fn reset_replay_storage(pool: &PgPool) -> Result<()> {
    sqlx::query(
        r#"
        TRUNCATE TABLE
            anomalies,
            quotes,
            trades
        "#,
    )
    .execute(pool)
    .await
    .context("failed to reset replay historical tables")?;

    info!("reset PostgreSQL replay tables for deterministic demo run");

    Ok(())
}

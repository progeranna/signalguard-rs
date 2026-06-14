use chrono::{DateTime, Utc};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::domain::{AnomalyEvent, AnomalyType, Severity, Symbol};

use super::StorageError;

const MAX_RECENT_ANOMALY_LIMIT: u32 = 500;

pub async fn insert_anomaly(pool: &PgPool, anomaly: &AnomalyEvent) -> Result<(), StorageError> {
    sqlx::query(
        r#"
        INSERT INTO anomalies (
            id,
            symbol,
            anomaly_type,
            severity,
            message,
            observed_value,
            threshold_value,
            event_time,
            created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(anomaly.id)
    .bind(anomaly.symbol.as_str())
    .bind(anomaly.anomaly_type.as_str())
    .bind(anomaly.severity.as_str())
    .bind(&anomaly.message)
    .bind(anomaly.observed_value)
    .bind(anomaly.threshold_value)
    .bind(anomaly.event_time)
    .bind(anomaly.created_at)
    .execute(pool)
    .await
    .map_err(|error| StorageError::database("insert_anomaly", error))?;

    Ok(())
}

pub async fn get_recent_anomalies(
    pool: &PgPool,
    symbol: Option<&Symbol>,
    limit: u32,
) -> Result<Vec<AnomalyEvent>, StorageError> {
    let limit = validate_recent_anomaly_limit(limit)?;
    let rows = if let Some(symbol) = symbol {
        sqlx::query(
            r#"
            SELECT
                id,
                symbol,
                anomaly_type,
                severity,
                message,
                observed_value,
                threshold_value,
                event_time,
                created_at
            FROM anomalies
            WHERE symbol = $1
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(symbol.as_str())
        .bind(i64::from(limit))
        .fetch_all(pool)
        .await
        .map_err(|error| StorageError::database("get_recent_anomalies", error))?
    } else {
        sqlx::query(
            r#"
            SELECT
                id,
                symbol,
                anomaly_type,
                severity,
                message,
                observed_value,
                threshold_value,
                event_time,
                created_at
            FROM anomalies
            ORDER BY created_at DESC
            LIMIT $1
            "#,
        )
        .bind(i64::from(limit))
        .fetch_all(pool)
        .await
        .map_err(|error| StorageError::database("get_recent_anomalies", error))?
    };

    rows.into_iter()
        .map(|row| map_anomaly_row(&row))
        .collect::<Result<Vec<_>, _>>()
}

fn validate_recent_anomaly_limit(limit: u32) -> Result<u32, StorageError> {
    if limit == 0 {
        return Err(StorageError::invalid_argument(
            "limit",
            "recent anomaly limit must be greater than zero",
        ));
    }
    if limit > MAX_RECENT_ANOMALY_LIMIT {
        return Err(StorageError::invalid_argument(
            "limit",
            format!(
                "recent anomaly limit must be less than or equal to {MAX_RECENT_ANOMALY_LIMIT}"
            ),
        ));
    }

    Ok(limit)
}

fn map_anomaly_row(row: &sqlx::postgres::PgRow) -> Result<AnomalyEvent, StorageError> {
    let symbol = Symbol::new(row.get::<String, _>("symbol"))
        .map_err(|error| StorageError::mapping("get_recent_anomalies", error.to_string()))?;
    let anomaly_type = AnomalyType::parse(&row.get::<String, _>("anomaly_type"))
        .map_err(|error| StorageError::mapping("get_recent_anomalies", error.to_string()))?;
    let severity = Severity::parse(&row.get::<String, _>("severity"))
        .map_err(|error| StorageError::mapping("get_recent_anomalies", error.to_string()))?;

    Ok(AnomalyEvent {
        id: row.get::<Uuid, _>("id"),
        symbol,
        anomaly_type,
        severity,
        message: row.get::<String, _>("message"),
        observed_value: row.get::<Option<f64>, _>("observed_value"),
        threshold_value: row.get::<Option<f64>, _>("threshold_value"),
        event_time: row.get::<DateTime<Utc>, _>("event_time"),
        created_at: row.get::<DateTime<Utc>, _>("created_at"),
    })
}

#[cfg(test)]
mod tests {
    use super::validate_recent_anomaly_limit;

    #[test]
    fn recent_anomaly_limit_rejects_zero() {
        let error = validate_recent_anomaly_limit(0).unwrap_err().to_string();

        assert!(error.contains("greater than zero"));
    }

    #[test]
    fn recent_anomaly_limit_rejects_large_values() {
        let error = validate_recent_anomaly_limit(501).unwrap_err().to_string();

        assert!(error.contains("less than or equal to 500"));
    }

    #[test]
    fn recent_anomaly_limit_accepts_normal_values() {
        assert_eq!(validate_recent_anomaly_limit(50).unwrap(), 50);
    }
}

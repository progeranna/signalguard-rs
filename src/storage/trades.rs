use std::convert::TryFrom;

use sqlx::PgPool;

use crate::domain::TradeEvent;

use super::StorageError;

pub async fn insert_trade(pool: &PgPool, trade: &TradeEvent) -> Result<(), StorageError> {
    let trade_id = trade.trade_id.map(i64::try_from).transpose().map_err(|_| {
        StorageError::invalid_argument("trade.trade_id", "trade_id exceeds BIGINT range")
    })?;

    sqlx::query(
        r#"
        INSERT INTO trades (
            symbol,
            exchange,
            trade_id,
            price,
            quantity,
            event_time,
            ingest_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(trade.symbol.as_str())
    .bind(trade.exchange.as_str())
    .bind(trade_id)
    .bind(trade.price)
    .bind(trade.quantity)
    .bind(trade.event_time)
    .bind(trade.ingest_time)
    .execute(pool)
    .await
    .map_err(|error| StorageError::database("insert_trade", error))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rust_decimal::Decimal;
    use sqlx::PgPool;

    use super::insert_trade;
    use crate::domain::{Exchange, Symbol, TradeEvent};

    #[tokio::test]
    async fn oversized_trade_id_is_rejected_before_query() {
        let trade = TradeEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(u64::MAX),
            Decimal::new(100, 0),
            Decimal::new(1, 0),
            Utc::now(),
            Utc::now(),
        )
        .unwrap();

        let pool = unused_test_pool();
        let error = insert_trade(&pool, &trade).await.unwrap_err().to_string();

        assert!(error.contains("trade_id exceeds BIGINT range"));
    }

    fn unused_test_pool() -> PgPool {
        sqlx::postgres::PgPoolOptions::new().connect_lazy_with(
            sqlx::postgres::PgConnectOptions::new()
                .host("/tmp/signalguard-rs-test-unused-postgres")
                .username("signalguard")
                .password("signalguard")
                .database("signalguard"),
        )
    }
}

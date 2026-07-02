use std::convert::TryFrom;

use sqlx::PgPool;
use sqlx::Row;

use crate::domain::{Exchange, Symbol, TradeEvent};

use super::StorageError;

pub(crate) const MAX_MARKET_TIMELINE_TRADE_LIMIT: u32 = 500;

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

pub async fn get_recent_trades_for_symbol(
    pool: &PgPool,
    symbol: &Symbol,
    limit: u32,
) -> Result<Vec<TradeEvent>, StorageError> {
    let limit = validate_market_timeline_trade_limit(limit)?;
    let rows = sqlx::query(
        r#"
        SELECT
            symbol,
            exchange,
            trade_id,
            price,
            quantity,
            event_time,
            ingest_time
        FROM trades
        WHERE symbol = $1
        ORDER BY event_time DESC
        LIMIT $2
        "#,
    )
    .bind(symbol.as_str())
    .bind(i64::from(limit))
    .fetch_all(pool)
    .await
    .map_err(|error| StorageError::database("get_recent_trades_for_symbol", error))?;

    let mut trades = rows
        .into_iter()
        .map(|row| map_trade_row(&row))
        .collect::<Result<Vec<_>, _>>()?;
    trades.reverse();

    Ok(trades)
}

fn validate_market_timeline_trade_limit(limit: u32) -> Result<u32, StorageError> {
    if limit == 0 {
        return Err(StorageError::invalid_argument(
            "limit",
            "market timeline trade limit must be greater than zero",
        ));
    }

    if limit > MAX_MARKET_TIMELINE_TRADE_LIMIT {
        return Err(StorageError::invalid_argument(
            "limit",
            format!(
                "market timeline trade limit must be less than or equal to {MAX_MARKET_TIMELINE_TRADE_LIMIT}"
            ),
        ));
    }

    Ok(limit)
}

fn map_trade_row(row: &sqlx::postgres::PgRow) -> Result<TradeEvent, StorageError> {
    let symbol = Symbol::new(row.get::<String, _>("symbol")).map_err(|error| {
        StorageError::mapping("get_recent_trades_for_symbol", error.to_string())
    })?;
    let exchange = Exchange::parse(&row.get::<String, _>("exchange")).map_err(|error| {
        StorageError::mapping("get_recent_trades_for_symbol", error.to_string())
    })?;
    let trade_id = row
        .get::<Option<i64>, _>("trade_id")
        .map(|value| {
            u64::try_from(value).map_err(|_| {
                StorageError::mapping(
                    "get_recent_trades_for_symbol",
                    "trade_id must not be negative",
                )
            })
        })
        .transpose()?;

    Ok(TradeEvent {
        symbol,
        exchange,
        trade_id,
        price: row.get("price"),
        quantity: row.get("quantity"),
        event_time: row.get("event_time"),
        ingest_time: row.get("ingest_time"),
    })
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rust_decimal::Decimal;
    use sqlx::PgPool;

    use super::{insert_trade, validate_market_timeline_trade_limit};
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

    #[test]
    fn market_timeline_trade_limit_rejects_zero() {
        let error = validate_market_timeline_trade_limit(0)
            .unwrap_err()
            .to_string();

        assert!(error.contains("greater than zero"));
    }

    #[test]
    fn market_timeline_trade_limit_rejects_large_values() {
        let error = validate_market_timeline_trade_limit(501)
            .unwrap_err()
            .to_string();

        assert!(error.contains("less than or equal to 500"));
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

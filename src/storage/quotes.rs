use sqlx::PgPool;

use crate::domain::QuoteEvent;

use super::StorageError;

pub async fn insert_quote(pool: &PgPool, quote: &QuoteEvent) -> Result<(), StorageError> {
    sqlx::query(
        r#"
        INSERT INTO quotes (
            symbol,
            exchange,
            best_bid_price,
            best_bid_quantity,
            best_ask_price,
            best_ask_quantity,
            event_time,
            ingest_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
    )
    .bind(quote.symbol.as_str())
    .bind(quote.exchange.as_str())
    .bind(quote.top_of_book.best_bid_price)
    .bind(quote.top_of_book.best_bid_quantity)
    .bind(quote.top_of_book.best_ask_price)
    .bind(quote.top_of_book.best_ask_quantity)
    .bind(quote.event_time)
    .bind(quote.ingest_time)
    .execute(pool)
    .await
    .map_err(|error| StorageError::database("insert_quote", error))?;

    Ok(())
}

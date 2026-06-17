use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use signalguard_rs::{
    domain::{
        AnomalyEvent, AnomalyMeasurement, AnomalyType, Exchange, QuoteEvent, Severity, Symbol,
        TopOfBookQuote, TradeEvent,
    },
    storage::{get_recent_anomalies, insert_anomaly, insert_quote, insert_trade, postgres},
};
use sqlx::{PgPool, Row};

#[tokio::test]
#[ignore = "requires local PostgreSQL via docker compose, DATABASE_URL, and applied migrations"]
async fn insert_trade_writes_a_trade_row() {
    let pool = test_pool().await;
    let symbol = test_symbol("TRADE");
    let trade = TradeEvent::new(
        symbol.clone(),
        Exchange::Binance,
        Some(42),
        Decimal::new(6500010, 2),
        Decimal::new(125, 3),
        fixed_time(2026, 1, 1, 0, 0, 0),
        fixed_time(2026, 1, 1, 0, 0, 1),
    )
    .unwrap();

    insert_trade(&pool, &trade).await.unwrap();

    let row = sqlx::query(
        r#"
        SELECT symbol, exchange, trade_id, price, quantity, event_time, ingest_time
        FROM trades
        WHERE symbol = $1
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .bind(symbol.as_str())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(row.get::<String, _>("symbol"), symbol.as_str());
    assert_eq!(row.get::<String, _>("exchange"), "binance");
    assert_eq!(row.get::<Option<i64>, _>("trade_id"), Some(42));
    assert_eq!(row.get::<Decimal, _>("price"), trade.price);
    assert_eq!(row.get::<Decimal, _>("quantity"), trade.quantity);
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("event_time"),
        trade.event_time
    );
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("ingest_time"),
        trade.ingest_time
    );

    cleanup_symbol_rows(&pool, &symbol).await;
}

#[tokio::test]
#[ignore = "requires local PostgreSQL via docker compose, DATABASE_URL, and applied migrations"]
async fn insert_quote_writes_a_quote_row() {
    let pool = test_pool().await;
    let symbol = test_symbol("QUOTE");
    let quote = QuoteEvent::new(
        symbol.clone(),
        Exchange::Binance,
        TopOfBookQuote::new(
            Decimal::new(6499910, 2),
            Decimal::new(2500, 3),
            Decimal::new(6500020, 2),
            Decimal::new(1750, 3),
        )
        .unwrap(),
        fixed_time(2026, 1, 1, 0, 1, 0),
        fixed_time(2026, 1, 1, 0, 1, 1),
    )
    .unwrap();

    insert_quote(&pool, &quote).await.unwrap();

    let row = sqlx::query(
        r#"
        SELECT
            symbol,
            exchange,
            best_bid_price,
            best_bid_quantity,
            best_ask_price,
            best_ask_quantity,
            event_time,
            ingest_time
        FROM quotes
        WHERE symbol = $1
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .bind(symbol.as_str())
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(row.get::<String, _>("symbol"), symbol.as_str());
    assert_eq!(row.get::<String, _>("exchange"), "binance");
    assert_eq!(
        row.get::<Decimal, _>("best_bid_price"),
        quote.top_of_book.best_bid_price
    );
    assert_eq!(
        row.get::<Decimal, _>("best_bid_quantity"),
        quote.top_of_book.best_bid_quantity
    );
    assert_eq!(
        row.get::<Decimal, _>("best_ask_price"),
        quote.top_of_book.best_ask_price
    );
    assert_eq!(
        row.get::<Decimal, _>("best_ask_quantity"),
        quote.top_of_book.best_ask_quantity
    );
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("event_time"),
        quote.event_time
    );
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("ingest_time"),
        quote.ingest_time
    );

    cleanup_symbol_rows(&pool, &symbol).await;
}

#[tokio::test]
#[ignore = "requires local PostgreSQL via docker compose, DATABASE_URL, and applied migrations"]
async fn insert_anomaly_writes_an_anomaly_row() {
    let pool = test_pool().await;
    let symbol = test_symbol("ANOM");
    let anomaly = AnomalyEvent::new(
        symbol.clone(),
        AnomalyType::SpreadSpike,
        Severity::Warning,
        "spread widened in integration test",
        AnomalyMeasurement {
            observed_value: Some(1.25),
            threshold_value: Some(0.50),
        },
        fixed_time(2026, 1, 1, 0, 2, 0),
        fixed_time(2026, 1, 1, 0, 2, 1),
    );

    insert_anomaly(&pool, &anomaly).await.unwrap();

    let row = sqlx::query(
        r#"
        SELECT
            symbol,
            anomaly_type,
            severity,
            message,
            observed_value,
            threshold_value,
            event_time,
            created_at
        FROM anomalies
        WHERE id = $1
        "#,
    )
    .bind(anomaly.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(row.get::<String, _>("symbol"), symbol.as_str());
    assert_eq!(row.get::<String, _>("anomaly_type"), "spread_spike");
    assert_eq!(row.get::<String, _>("severity"), "warning");
    assert_eq!(
        row.get::<String, _>("message"),
        "spread widened in integration test"
    );
    assert_eq!(row.get::<Option<f64>, _>("observed_value"), Some(1.25));
    assert_eq!(row.get::<Option<f64>, _>("threshold_value"), Some(0.50));
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("event_time"),
        anomaly.event_time
    );
    assert_eq!(
        row.get::<chrono::DateTime<Utc>, _>("created_at"),
        anomaly.created_at
    );

    cleanup_symbol_rows(&pool, &symbol).await;
}

#[tokio::test]
#[ignore = "requires local PostgreSQL via docker compose, DATABASE_URL, and applied migrations"]
async fn get_recent_anomalies_filters_by_symbol_and_respects_limit() {
    let pool = test_pool().await;
    let symbol = test_symbol("ANOMF");
    let other_symbol = test_symbol("ANOMO");
    let older = AnomalyEvent::new(
        symbol.clone(),
        AnomalyType::PriceMove,
        Severity::Info,
        "older anomaly for symbol filter test",
        AnomalyMeasurement {
            observed_value: Some(2.0),
            threshold_value: Some(1.0),
        },
        fixed_time(2026, 1, 1, 0, 3, 0),
        fixed_time(2026, 1, 1, 0, 3, 0),
    );
    let newer = AnomalyEvent::new(
        symbol.clone(),
        AnomalyType::TradeBurst,
        Severity::Critical,
        "newer anomaly for symbol filter test",
        AnomalyMeasurement {
            observed_value: Some(10.0),
            threshold_value: Some(3.0),
        },
        fixed_time(2026, 1, 1, 0, 3, 1),
        fixed_time(2026, 1, 1, 0, 3, 1),
    );
    let other = AnomalyEvent::new(
        other_symbol.clone(),
        AnomalyType::StaleData,
        Severity::Warning,
        "other symbol anomaly",
        AnomalyMeasurement {
            observed_value: Some(6_000.0),
            threshold_value: Some(5_000.0),
        },
        fixed_time(2026, 1, 1, 0, 3, 2),
        fixed_time(2026, 1, 1, 0, 3, 2),
    );

    insert_anomaly(&pool, &older).await.unwrap();
    insert_anomaly(&pool, &newer).await.unwrap();
    insert_anomaly(&pool, &other).await.unwrap();

    let limited = get_recent_anomalies(&pool, Some(&symbol), 1).await.unwrap();
    assert_eq!(limited.len(), 1);
    assert_eq!(limited[0].id, newer.id);

    let all_for_symbol = get_recent_anomalies(&pool, Some(&symbol), 2).await.unwrap();
    assert_eq!(all_for_symbol.len(), 2);
    assert_eq!(all_for_symbol[0].id, newer.id);
    assert_eq!(all_for_symbol[1].id, older.id);
    assert!(
        all_for_symbol
            .iter()
            .all(|anomaly| anomaly.symbol == symbol)
    );

    cleanup_symbol_rows(&pool, &symbol).await;
    cleanup_symbol_rows(&pool, &other_symbol).await;
}

#[tokio::test]
#[ignore = "requires local PostgreSQL via docker compose, DATABASE_URL, and applied migrations"]
async fn get_recent_anomalies_without_symbol_returns_recent_rows() {
    let pool = test_pool().await;
    let symbol = test_symbol("ANOMA");
    let anomaly = AnomalyEvent::new(
        symbol.clone(),
        AnomalyType::TradeBurst,
        Severity::Critical,
        "recent anomaly for unfiltered query test",
        AnomalyMeasurement {
            observed_value: Some(15.0),
            threshold_value: Some(5.0),
        },
        fixed_time(2099, 1, 1, 0, 0, 0),
        fixed_time(2099, 1, 1, 0, 0, 1),
    );

    insert_anomaly(&pool, &anomaly).await.unwrap();

    let recent = get_recent_anomalies(&pool, None, 10).await.unwrap();

    assert!(
        recent.iter().any(|item| item.id == anomaly.id),
        "expected unfiltered anomaly query to include inserted anomaly {} for symbol {}",
        anomaly.id,
        symbol.as_str()
    );

    cleanup_symbol_rows(&pool, &symbol).await;
}

async fn test_pool() -> PgPool {
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| {
        panic!(
            "DATABASE_URL is required for PostgreSQL integration tests; run `docker compose up -d postgres`, `export DATABASE_URL=\"postgres://signalguard:signalguard@localhost:5432/signalguard\"`, `sqlx migrate run`, then `cargo test --test postgres_storage -- --ignored`"
        )
    });
    let pool = postgres::connect_pool(&database_url)
        .await
        .unwrap_or_else(|error| {
            panic!("failed to connect to PostgreSQL integration test database: {error}")
        });

    ensure_required_tables(&pool).await;

    pool
}

async fn ensure_required_tables(pool: &PgPool) {
    for table_name in ["trades", "quotes", "anomalies"] {
        let exists = sqlx::query_scalar::<_, String>(
            r#"
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
            "#,
        )
        .bind(table_name)
        .fetch_optional(pool)
        .await
        .unwrap_or_else(|error| {
            panic!("failed to verify PostgreSQL schema for integration tests: {error}")
        });

        assert!(
            exists.is_some(),
            "required table `{table_name}` is missing; run `sqlx migrate run` before `cargo test --test postgres_storage -- --ignored`"
        );
    }
}

async fn cleanup_symbol_rows(pool: &PgPool, symbol: &Symbol) {
    for statement in [
        "DELETE FROM anomalies WHERE symbol = $1",
        "DELETE FROM quotes WHERE symbol = $1",
        "DELETE FROM trades WHERE symbol = $1",
    ] {
        sqlx::query(statement)
            .bind(symbol.as_str())
            .execute(pool)
            .await
            .unwrap();
    }
}

fn test_symbol(prefix: &str) -> Symbol {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    Symbol::new(format!("SG{prefix}{unique_suffix}")).unwrap()
}

fn fixed_time(
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, day, hour, minute, second)
        .unwrap()
}

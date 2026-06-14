use chrono::{DateTime, TimeZone, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;

use crate::{
    domain::{Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent},
    ingestion::NormalizedEvent,
};

const TRADE_STREAM_SUFFIX: &str = "@trade";
const BOOK_TICKER_STREAM_SUFFIX: &str = "@bookticker";

#[derive(Debug, Error)]
pub enum BinanceParseError {
    #[error("malformed Binance payload: {source}")]
    MalformedJson {
        #[source]
        source: serde_json::Error,
    },
    #[error("unsupported Binance combined stream `{stream}`")]
    UnknownStream { stream: String },
    #[error("invalid symbol `{value}`: {message}")]
    InvalidSymbol { value: String, message: String },
    #[error("field `{field}` must be a decimal string: {value}")]
    InvalidDecimal { field: &'static str, value: String },
    #[error("field `{field}` must be a valid millisecond timestamp: {value}")]
    InvalidTimestamp { field: &'static str, value: u64 },
    #[error("{message}")]
    InvalidEvent { message: String },
}

#[derive(Debug, Deserialize)]
struct CombinedStreamMessage {
    stream: String,
    data: Value,
}

#[derive(Debug, Deserialize)]
struct BinanceTradePayload {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "t")]
    trade_id: Option<u64>,
    #[serde(rename = "p")]
    price: String,
    #[serde(rename = "q")]
    quantity: String,
    #[serde(rename = "T")]
    trade_time: u64,
}

#[derive(Debug, Deserialize)]
struct BinanceBookTickerPayload {
    #[serde(rename = "s")]
    symbol: String,
    #[serde(rename = "b")]
    best_bid_price: String,
    #[serde(rename = "B")]
    best_bid_quantity: String,
    #[serde(rename = "a")]
    best_ask_price: String,
    #[serde(rename = "A")]
    best_ask_quantity: String,
    #[serde(rename = "E")]
    event_time: Option<u64>,
}

pub fn combined_stream_url(base_url: &str, symbols: &[Symbol]) -> anyhow::Result<String> {
    if symbols.is_empty() {
        anyhow::bail!("at least one symbol is required for Binance live ingestion");
    }

    let streams = symbols
        .iter()
        .flat_map(|symbol| {
            let lower = symbol.as_str().to_ascii_lowercase();
            [
                format!("{lower}{TRADE_STREAM_SUFFIX}"),
                format!("{lower}@bookTicker"),
            ]
        })
        .collect::<Vec<_>>()
        .join("/");

    Ok(format!("{base_url}/stream?streams={streams}"))
}

pub fn parse_combined_stream_message(
    payload: &str,
    ingest_time: DateTime<Utc>,
) -> Result<NormalizedEvent, BinanceParseError> {
    let message = serde_json::from_str::<CombinedStreamMessage>(payload)
        .map_err(|source| BinanceParseError::MalformedJson { source })?;

    if message.stream.ends_with(TRADE_STREAM_SUFFIX) {
        let trade = serde_json::from_value::<BinanceTradePayload>(message.data)
            .map_err(|source| BinanceParseError::MalformedJson { source })?;
        return parse_trade_payload(trade, ingest_time).map(NormalizedEvent::Trade);
    }
    if message
        .stream
        .to_ascii_lowercase()
        .ends_with(BOOK_TICKER_STREAM_SUFFIX)
    {
        let quote = serde_json::from_value::<BinanceBookTickerPayload>(message.data)
            .map_err(|source| BinanceParseError::MalformedJson { source })?;
        return parse_book_ticker_payload(quote, ingest_time).map(NormalizedEvent::Quote);
    }

    Err(BinanceParseError::UnknownStream {
        stream: message.stream,
    })
}

fn parse_trade_payload(
    payload: BinanceTradePayload,
    ingest_time: DateTime<Utc>,
) -> Result<TradeEvent, BinanceParseError> {
    let symbol = parse_symbol(payload.symbol)?;
    let event_time = parse_timestamp("T", payload.trade_time)?;
    let price = parse_decimal("p", payload.price)?;
    let quantity = parse_decimal("q", payload.quantity)?;

    TradeEvent::new(
        symbol,
        Exchange::Binance,
        payload.trade_id,
        price,
        quantity,
        event_time,
        ingest_time,
    )
    .map_err(|error| BinanceParseError::InvalidEvent {
        message: error.to_string(),
    })
}

fn parse_book_ticker_payload(
    payload: BinanceBookTickerPayload,
    ingest_time: DateTime<Utc>,
) -> Result<QuoteEvent, BinanceParseError> {
    let symbol = parse_symbol(payload.symbol)?;
    let event_time = match payload.event_time {
        Some(raw) => parse_timestamp("E", raw)?,
        None => ingest_time,
    };
    let top_of_book = TopOfBookQuote::new(
        parse_decimal("b", payload.best_bid_price)?,
        parse_decimal("B", payload.best_bid_quantity)?,
        parse_decimal("a", payload.best_ask_price)?,
        parse_decimal("A", payload.best_ask_quantity)?,
    )
    .map_err(|error| BinanceParseError::InvalidEvent {
        message: error.to_string(),
    })?;

    QuoteEvent::new(
        symbol,
        Exchange::Binance,
        top_of_book,
        event_time,
        ingest_time,
    )
    .map_err(|error| BinanceParseError::InvalidEvent {
        message: error.to_string(),
    })
}

fn parse_symbol(value: String) -> Result<Symbol, BinanceParseError> {
    Symbol::new(value.clone()).map_err(|error| BinanceParseError::InvalidSymbol {
        value,
        message: error.to_string(),
    })
}

fn parse_decimal(field: &'static str, value: String) -> Result<Decimal, BinanceParseError> {
    value
        .parse::<Decimal>()
        .map_err(|_| BinanceParseError::InvalidDecimal { field, value })
}

fn parse_timestamp(field: &'static str, value: u64) -> Result<DateTime<Utc>, BinanceParseError> {
    Utc.timestamp_millis_opt(value as i64)
        .single()
        .ok_or(BinanceParseError::InvalidTimestamp { field, value })
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::{combined_stream_url, parse_combined_stream_message};
    use crate::{domain::Symbol, ingestion::NormalizedEvent};

    #[test]
    fn valid_binance_trade_payload_parses() {
        let event = parse_combined_stream_message(
            r#"{"stream":"btcusdt@trade","data":{"s":"BTCUSDT","t":12345,"p":"65000.10","q":"0.150","T":1767225600000}}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 2).unwrap(),
        )
        .unwrap();

        match event {
            NormalizedEvent::Trade(trade) => {
                assert_eq!(trade.symbol.as_str(), "BTCUSDT");
                assert_eq!(trade.trade_id, Some(12345));
                assert_eq!(trade.price, Decimal::new(6500010, 2));
                assert_eq!(trade.quantity, Decimal::new(150, 3));
            }
            other => panic!("expected trade event, got {other:?}"),
        }
    }

    #[test]
    fn valid_binance_book_ticker_payload_parses() {
        let event = parse_combined_stream_message(
            r#"{"stream":"btcusdt@bookTicker","data":{"s":"BTCUSDT","b":"64999.10","B":"2.500","a":"65000.20","A":"1.750","E":1767225601000}}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 2).unwrap(),
        )
        .unwrap();

        match event {
            NormalizedEvent::Quote(quote) => {
                assert_eq!(quote.symbol.as_str(), "BTCUSDT");
                assert_eq!(quote.top_of_book.best_bid_price, Decimal::new(6499910, 2));
                assert_eq!(quote.top_of_book.best_ask_quantity, Decimal::new(1750, 3));
            }
            other => panic!("expected quote event, got {other:?}"),
        }
    }

    #[test]
    fn malformed_trade_payload_returns_error() {
        let error = parse_combined_stream_message(
            r#"{"stream":"btcusdt@trade","data":{"s":"BTCUSDT","p":"65000.10"}}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 2).unwrap(),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("malformed Binance payload"));
    }

    #[test]
    fn invalid_symbol_is_rejected() {
        let error = parse_combined_stream_message(
            r#"{"stream":"btc-usdt@trade","data":{"s":"BTC-USDT","t":12345,"p":"65000.10","q":"0.150","T":1767225600000}}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 2).unwrap(),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("invalid symbol `BTC-USDT`"));
    }

    #[test]
    fn combined_stream_url_supports_trade_and_book_ticker_streams() {
        let url = combined_stream_url(
            "wss://stream.binance.com:9443",
            &[
                Symbol::new("BTCUSDT").unwrap(),
                Symbol::new("ETHUSDT").unwrap(),
            ],
        )
        .unwrap();

        assert_eq!(
            url,
            "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/btcusdt@bookTicker/ethusdt@trade/ethusdt@bookTicker"
        );
    }
}

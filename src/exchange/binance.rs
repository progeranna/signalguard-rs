use chrono::{DateTime, TimeZone, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;
use thiserror::Error;

use crate::{
    depth_json::parse_depth_level_pair_strings,
    domain::{DepthLevel, DepthUpdate, Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent},
    ingestion::NormalizedEvent,
};

const TRADE_STREAM_SUFFIX: &str = "@trade";
const BOOK_TICKER_STREAM_SUFFIX: &str = "@bookticker";
const DEPTH_STREAM_SUFFIX: &str = "@depth";

#[derive(Debug, Error)]
pub enum BinanceParseError {
    #[error("malformed Binance payload: {source}")]
    MalformedJson {
        #[source]
        source: serde_json::Error,
    },
    #[error("unsupported Binance combined stream `{stream}`")]
    UnknownStream { stream: String },
    #[error("missing required field `{field}`")]
    MissingField { field: &'static str },
    #[error("unsupported Binance event type `{event_type}`")]
    UnknownEventType { event_type: String },
    #[error("invalid symbol `{value}`: {message}")]
    InvalidSymbol { value: String, message: String },
    #[error("field `{field}` must be a decimal string: {value}")]
    InvalidDecimal { field: &'static str, value: String },
    #[error("field `{field}` must be an unsigned integer: {value}")]
    InvalidUnsignedInteger { field: &'static str, value: String },
    #[error("field `{field}` must be a valid millisecond timestamp: {value}")]
    InvalidTimestamp { field: &'static str, value: u64 },
    #[error("field `{field}` level {index} must be [price, quantity] strings")]
    InvalidDepthLevelShape { field: &'static str, index: usize },
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BinanceStreamKind {
    Trade,
    BookTicker,
    Depth,
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
                format!("{lower}{DEPTH_STREAM_SUFFIX}"),
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

    match classify_stream(&message.stream) {
        Some(BinanceStreamKind::Trade) => {
            let trade = serde_json::from_value::<BinanceTradePayload>(message.data)
                .map_err(|source| BinanceParseError::MalformedJson { source })?;
            parse_trade_payload(trade, ingest_time).map(NormalizedEvent::Trade)
        }
        Some(BinanceStreamKind::BookTicker) => {
            let quote = serde_json::from_value::<BinanceBookTickerPayload>(message.data)
                .map_err(|source| BinanceParseError::MalformedJson { source })?;
            parse_book_ticker_payload(quote, ingest_time).map(NormalizedEvent::Quote)
        }
        Some(BinanceStreamKind::Depth) => {
            parse_depth_payload(message.data, ingest_time).map(NormalizedEvent::Depth)
        }
        None => Err(BinanceParseError::UnknownStream {
            stream: message.stream,
        }),
    }
}

fn classify_stream(stream: &str) -> Option<BinanceStreamKind> {
    if stream.ends_with(TRADE_STREAM_SUFFIX) {
        return Some(BinanceStreamKind::Trade);
    }
    if stream
        .to_ascii_lowercase()
        .ends_with(BOOK_TICKER_STREAM_SUFFIX)
    {
        return Some(BinanceStreamKind::BookTicker);
    }
    if is_depth_stream(stream) {
        return Some(BinanceStreamKind::Depth);
    }

    None
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

fn parse_depth_payload(
    payload: Value,
    ingest_time: DateTime<Utc>,
) -> Result<DepthUpdate, BinanceParseError> {
    let event_type = required_string_field(&payload, "e")?;
    if event_type != "depthUpdate" {
        return Err(BinanceParseError::UnknownEventType { event_type });
    }

    let symbol = parse_symbol(required_string_field(&payload, "s")?)?;
    let event_time = parse_timestamp("E", required_u64_field(&payload, "E")?)?;
    let first_update_id = required_u64_field(&payload, "U")?;
    let final_update_id = required_u64_field(&payload, "u")?;
    let bids = parse_depth_levels(&payload, "b", "b.price", "b.quantity")?;
    let asks = parse_depth_levels(&payload, "a", "a.price", "a.quantity")?;

    DepthUpdate::new(
        symbol,
        Exchange::Binance,
        Some(first_update_id),
        Some(final_update_id),
        bids,
        asks,
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

fn is_depth_stream(stream: &str) -> bool {
    let stream = stream.to_ascii_lowercase();
    stream.ends_with(DEPTH_STREAM_SUFFIX) || stream.contains("@depth@")
}

fn required_string_field(
    payload: &Value,
    field: &'static str,
) -> Result<String, BinanceParseError> {
    match payload.get(field) {
        Some(Value::String(value)) => Ok(value.clone()),
        Some(other) => Err(BinanceParseError::InvalidEvent {
            message: format!("field `{field}` must be a string: {other}"),
        }),
        None => Err(BinanceParseError::MissingField { field }),
    }
}

fn required_u64_field(payload: &Value, field: &'static str) -> Result<u64, BinanceParseError> {
    match payload.get(field) {
        Some(Value::Number(value)) => {
            value
                .as_u64()
                .ok_or_else(|| BinanceParseError::InvalidUnsignedInteger {
                    field,
                    value: value.to_string(),
                })
        }
        Some(Value::String(value)) => {
            value
                .parse::<u64>()
                .map_err(|_| BinanceParseError::InvalidUnsignedInteger {
                    field,
                    value: value.clone(),
                })
        }
        Some(other) => Err(BinanceParseError::InvalidUnsignedInteger {
            field,
            value: other.to_string(),
        }),
        None => Err(BinanceParseError::MissingField { field }),
    }
}

fn parse_depth_levels(
    payload: &Value,
    field: &'static str,
    price_field: &'static str,
    quantity_field: &'static str,
) -> Result<Vec<DepthLevel>, BinanceParseError> {
    let levels = payload
        .get(field)
        .ok_or(BinanceParseError::MissingField { field })?
        .as_array()
        .ok_or_else(|| BinanceParseError::InvalidEvent {
            message: format!("field `{field}` must be an array"),
        })?;

    levels
        .iter()
        .enumerate()
        .map(|(index, level)| parse_depth_level(level, field, index, price_field, quantity_field))
        .collect()
}

fn parse_depth_level(
    level: &Value,
    field: &'static str,
    index: usize,
    price_field: &'static str,
    quantity_field: &'static str,
) -> Result<DepthLevel, BinanceParseError> {
    let invalid_shape = || BinanceParseError::InvalidDepthLevelShape { field, index };
    let (price, quantity) = parse_depth_level_pair_strings(level, invalid_shape)?;

    DepthLevel::new(
        parse_decimal(price_field, price.to_owned())?,
        parse_decimal(quantity_field, quantity.to_owned())?,
    )
    .map_err(|error| BinanceParseError::InvalidEvent {
        message: error.to_string(),
    })
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
    fn valid_binance_depth_payload_parses() {
        let event = parse_combined_stream_message(
            r#"{"stream":"btcusdt@depth","data":{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[["65048.00","1.20"],["65047.50","0"]],"a":[["65055.00","0.80"]]}}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 3).unwrap(),
        )
        .unwrap();

        match event {
            NormalizedEvent::Depth(update) => {
                assert_eq!(update.symbol.as_str(), "BTCUSDT");
                assert_eq!(update.first_update_id, Some(100));
                assert_eq!(update.final_update_id, Some(101));
                assert_eq!(update.bids.len(), 2);
                assert_eq!(update.asks.len(), 1);
                assert_eq!(update.bids[0].price, Decimal::new(6504800, 2));
                assert_eq!(update.bids[0].quantity, Decimal::new(120, 2));
                assert_eq!(update.bids[1].quantity, Decimal::ZERO);
                assert_eq!(update.asks[0].price, Decimal::new(6505500, 2));
                assert_eq!(
                    update.event_time,
                    Utc.timestamp_millis_opt(1_767_225_602_000).unwrap()
                );
                assert_eq!(
                    update.ingest_time,
                    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 3).unwrap()
                );
            }
            other => panic!("expected depth event, got {other:?}"),
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
    fn malformed_depth_json_returns_error() {
        assert_parse_error_contains(
            r#"{"stream":"btcusdt@depth","data":{"e":"depthUpdate""#,
            "malformed Binance payload",
        );
    }

    #[test]
    fn invalid_decimal_in_depth_bid_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[["invalid","1.20"]],"a":[["65055.00","0.80"]]}"#,
            "field `b.price` must be a decimal string",
        );
    }

    #[test]
    fn malformed_depth_level_shape_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[["65048.00"]],"a":[["65055.00","0.80"]]}"#,
            "field `b` level 0 must be [price, quantity] strings",
        );
    }

    #[test]
    fn invalid_depth_symbol_is_rejected() {
        assert_depth_stream_error_contains(
            "btc-usdt@depth",
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTC-USDT","U":100,"u":101,"b":[["65048.00","1.20"]],"a":[["65055.00","0.80"]]}"#,
            "invalid symbol `BTC-USDT`",
        );
    }

    #[test]
    fn missing_depth_symbol_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"U":100,"u":101,"b":[["65048.00","1.20"]],"a":[["65055.00","0.80"]]}"#,
            "missing required field `s`",
        );
    }

    #[test]
    fn missing_depth_bids_field_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"a":[["65055.00","0.80"]]}"#,
            "missing required field `b`",
        );
    }

    #[test]
    fn invalid_depth_update_id_range_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":101,"u":100,"b":[["65048.00","1.20"]],"a":[["65055.00","0.80"]]}"#,
            "final_update_id must be greater than or equal to first_update_id",
        );
    }

    #[test]
    fn unknown_depth_event_type_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"bookTicker","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[["65048.00","1.20"]],"a":[["65055.00","0.80"]]}"#,
            "unsupported Binance event type `bookTicker`",
        );
    }

    #[test]
    fn empty_depth_update_is_rejected() {
        assert_depth_error_contains(
            r#"{"e":"depthUpdate","E":1767225602000,"s":"BTCUSDT","U":100,"u":101,"b":[],"a":[]}"#,
            "depth update must contain at least one bid or ask level",
        );
    }

    fn assert_depth_error_contains(data: &str, expected: &str) {
        assert_depth_stream_error_contains("btcusdt@depth", data, expected);
    }

    fn assert_depth_stream_error_contains(stream: &str, data: &str, expected: &str) {
        let payload = format!(r#"{{"stream":"{stream}","data":{data}}}"#);

        assert_parse_error_contains(&payload, expected);
    }

    fn assert_parse_error_contains(payload: &str, expected: &str) {
        let error = parse_combined_stream_message(payload, fixed_ingest_time())
            .unwrap_err()
            .to_string();

        assert!(
            error.contains(expected),
            "expected error to contain {expected:?}, got {error:?}"
        );
    }

    fn fixed_ingest_time() -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 3).unwrap()
    }

    #[test]
    fn combined_stream_url_includes_trade_book_ticker_and_depth_streams_for_each_symbol() {
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
            "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/btcusdt@bookTicker/btcusdt@depth/ethusdt@trade/ethusdt@bookTicker/ethusdt@depth"
        );
    }
}

use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use tokio::{
    fs::File,
    io::{AsyncBufReadExt, BufReader},
    sync::mpsc,
    time::sleep,
};
use tracing::info;

use crate::{
    domain::{Exchange, QuoteEvent, Symbol, TopOfBookQuote, TradeEvent},
    telemetry::InternalCounters,
};

use super::{
    NormalizedEvent,
    error::{ReplayError, ReplayParseError},
};

#[derive(Clone, Copy, Debug, Default)]
pub struct ReplayOptions {
    pub delay_between_events: Option<Duration>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ReplayRunReport {
    pub emitted_events: usize,
}

impl ReplayOptions {
    pub fn from_delay_ms(delay_ms: u64) -> Self {
        let delay_between_events = if delay_ms == 0 {
            None
        } else {
            Some(Duration::from_millis(delay_ms))
        };

        Self {
            delay_between_events,
        }
    }
}

pub async fn run_replay_source(
    path: &Path,
    sender: mpsc::Sender<NormalizedEvent>,
    options: ReplayOptions,
    counters: InternalCounters,
) -> Result<ReplayRunReport, ReplayError> {
    let file = File::open(path).await.map_err(|source| ReplayError::Io {
        path: path.to_path_buf(),
        source,
    })?;
    let mut lines = BufReader::new(file).lines();
    let mut emitted_events = 0usize;
    for line_number in 1.. {
        let line = match lines.next_line().await.map_err(|source| ReplayError::Io {
            path: path.to_path_buf(),
            source,
        })? {
            Some(line) => line,
            None => break,
        };

        let parsed_event =
            parse_jsonl_line_with_ingest_time(path.to_path_buf(), line_number, &line, Utc::now());
        let Some(event) = (match parsed_event {
            Ok(event) => event,
            Err(error) => {
                if matches!(error, ReplayError::Parse { .. }) {
                    counters.increment_parse_errors();
                }
                return Err(error);
            }
        }) else {
            continue;
        };

        if sender.send(event).await.is_err() {
            return Err(ReplayError::ReceiverDropped);
        }

        emitted_events += 1;

        if let Some(delay) = options.delay_between_events {
            sleep(delay).await;
        }
    }

    info!(path = %path.display(), emitted_events, "replay fixture processed");

    Ok(ReplayRunReport { emitted_events })
}

fn parse_jsonl_line_with_ingest_time(
    path: PathBuf,
    line_number: usize,
    line: &str,
    ingest_time: DateTime<Utc>,
) -> Result<Option<NormalizedEvent>, ReplayError> {
    if line.trim().is_empty() {
        return Ok(None);
    }

    let value = serde_json::from_str::<Value>(line).map_err(|source| ReplayError::Parse {
        path: path.clone(),
        line: line_number,
        kind: ReplayParseError::MalformedJson { source },
    })?;
    let event_type = required_string(&value, "type").map_err(|kind| ReplayError::Parse {
        path: path.clone(),
        line: line_number,
        kind,
    })?;

    let event = match event_type.as_str() {
        "trade" => {
            NormalizedEvent::Trade(parse_trade_event(&value, ingest_time).map_err(|kind| {
                ReplayError::Parse {
                    path: path.clone(),
                    line: line_number,
                    kind,
                }
            })?)
        }
        "quote" => {
            NormalizedEvent::Quote(parse_quote_event(&value, ingest_time).map_err(|kind| {
                ReplayError::Parse {
                    path: path.clone(),
                    line: line_number,
                    kind,
                }
            })?)
        }
        other => {
            return Err(ReplayError::Parse {
                path,
                line: line_number,
                kind: ReplayParseError::UnknownEventType {
                    value: other.to_owned(),
                },
            });
        }
    };

    Ok(Some(event))
}

fn parse_trade_event(
    value: &Value,
    ingest_time: DateTime<Utc>,
) -> Result<TradeEvent, ReplayParseError> {
    let symbol = parse_symbol(value)?;
    let exchange = parse_exchange(value)?;
    let price = parse_decimal(value, "price")?;
    let quantity = parse_decimal(value, "quantity")?;
    let event_time = parse_timestamp(value, "event_time")?;
    let trade_id = optional_u64(value, "trade_id")?;

    TradeEvent::new(
        symbol,
        exchange,
        trade_id,
        price,
        quantity,
        event_time,
        ingest_time,
    )
    .map_err(|error| ReplayParseError::InvalidEvent {
        message: error.to_string(),
    })
}

fn parse_quote_event(
    value: &Value,
    ingest_time: DateTime<Utc>,
) -> Result<QuoteEvent, ReplayParseError> {
    let symbol = parse_symbol(value)?;
    let exchange = parse_exchange(value)?;
    let event_time = parse_timestamp(value, "event_time")?;
    let top_of_book = TopOfBookQuote::new(
        parse_decimal(value, "best_bid_price")?,
        parse_decimal(value, "best_bid_quantity")?,
        parse_decimal(value, "best_ask_price")?,
        parse_decimal(value, "best_ask_quantity")?,
    )
    .map_err(|error| ReplayParseError::InvalidEvent {
        message: error.to_string(),
    })?;

    QuoteEvent::new(symbol, exchange, top_of_book, event_time, ingest_time).map_err(|error| {
        ReplayParseError::InvalidEvent {
            message: error.to_string(),
        }
    })
}

fn parse_symbol(value: &Value) -> Result<Symbol, ReplayParseError> {
    let symbol = required_string(value, "symbol")?;

    Symbol::new(symbol.clone()).map_err(|error| ReplayParseError::InvalidSymbol {
        value: symbol,
        message: error.to_string(),
    })
}

fn parse_exchange(value: &Value) -> Result<Exchange, ReplayParseError> {
    let exchange = required_string(value, "exchange")?;

    Exchange::parse(&exchange).map_err(|error| ReplayParseError::InvalidExchange {
        value: exchange,
        message: error.to_string(),
    })
}

fn parse_decimal(value: &Value, field: &'static str) -> Result<Decimal, ReplayParseError> {
    let raw = required_string(value, field)?;

    raw.parse::<Decimal>()
        .map_err(|_| ReplayParseError::InvalidDecimal { field, value: raw })
}

fn parse_timestamp(value: &Value, field: &'static str) -> Result<DateTime<Utc>, ReplayParseError> {
    let raw = required_string(value, field)?;

    DateTime::parse_from_rfc3339(&raw)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .map_err(|_| ReplayParseError::InvalidTimestamp { field, value: raw })
}

fn optional_u64(value: &Value, field: &'static str) -> Result<Option<u64>, ReplayParseError> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(number)) => number
            .as_u64()
            .ok_or_else(|| ReplayParseError::InvalidUnsignedInteger {
                field,
                value: number.to_string(),
            })
            .map(Some),
        Some(Value::String(raw)) => {
            raw.parse::<u64>()
                .map(Some)
                .map_err(|_| ReplayParseError::InvalidUnsignedInteger {
                    field,
                    value: raw.clone(),
                })
        }
        Some(other) => Err(ReplayParseError::InvalidUnsignedInteger {
            field,
            value: other.to_string(),
        }),
    }
}

fn required_string(value: &Value, field: &'static str) -> Result<String, ReplayParseError> {
    match value.get(field) {
        None | Some(Value::Null) => Err(ReplayParseError::MissingField { field }),
        Some(Value::String(raw)) => Ok(raw.clone()),
        Some(_) => Err(ReplayParseError::InvalidStringField { field }),
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::parse_jsonl_line_with_ingest_time;
    use crate::ingestion::NormalizedEvent;

    use super::ReplayError;

    #[test]
    fn replay_trade_line_parses() {
        let ingest_time = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap();
        let event = parse_jsonl_line_with_ingest_time(
            "fixture.jsonl".into(),
            1,
            r#"{"type":"trade","symbol":"BTCUSDT","exchange":"binance","trade_id":42,"price":"100000.10","quantity":"0.125","event_time":"2026-01-01T00:00:00Z"}"#,
            ingest_time,
        )
        .unwrap()
        .unwrap();

        match event {
            NormalizedEvent::Trade(trade) => {
                assert_eq!(trade.symbol.as_str(), "BTCUSDT");
                assert_eq!(trade.trade_id, Some(42));
                assert_eq!(trade.price, Decimal::new(10000010, 2));
                assert_eq!(trade.quantity, Decimal::new(125, 3));
                assert_eq!(trade.ingest_time, ingest_time);
            }
            other => panic!("expected trade event, got {other:?}"),
        }
    }

    #[test]
    fn replay_quote_line_parses() {
        let ingest_time = Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap();
        let event = parse_jsonl_line_with_ingest_time(
            "fixture.jsonl".into(),
            2,
            r#"{"type":"quote","symbol":"ETHUSDT","exchange":"binance","best_bid_price":"4000.10","best_bid_quantity":"2.5","best_ask_price":"4000.60","best_ask_quantity":"1.8","event_time":"2026-01-01T00:00:01Z"}"#,
            ingest_time,
        )
        .unwrap()
        .unwrap();

        match event {
            NormalizedEvent::Quote(quote) => {
                assert_eq!(quote.symbol.as_str(), "ETHUSDT");
                assert_eq!(quote.top_of_book.best_bid_price, Decimal::new(400010, 2));
                assert_eq!(quote.top_of_book.best_ask_quantity, Decimal::new(18, 1));
                assert_eq!(quote.ingest_time, ingest_time);
            }
            other => panic!("expected quote event, got {other:?}"),
        }
    }

    #[test]
    fn invalid_symbol_is_rejected() {
        let error = parse_jsonl_line_with_ingest_time(
            "fixture.jsonl".into(),
            3,
            r#"{"type":"trade","symbol":"BTC-USDT","exchange":"binance","price":"1","quantity":"1","event_time":"2026-01-01T00:00:00Z"}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap(),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("invalid symbol `BTC-USDT`"));
    }

    #[test]
    fn malformed_json_is_reported() {
        let error = parse_jsonl_line_with_ingest_time(
            "fixture.jsonl".into(),
            4,
            r#"{"type":"trade""#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap(),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("line 4"));
        assert!(error.contains("malformed JSON"));
    }

    #[test]
    fn unknown_event_type_is_reported() {
        let error = parse_jsonl_line_with_ingest_time(
            "fixture.jsonl".into(),
            5,
            r#"{"type":"depth","symbol":"BTCUSDT","exchange":"binance","event_time":"2026-01-01T00:00:00Z"}"#,
            Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 5).unwrap(),
        )
        .unwrap_err();

        match error {
            ReplayError::Parse { line, .. } => assert_eq!(line, 5),
            other => panic!("expected parse error, got {other:?}"),
        }

        assert!(
            error
                .to_string()
                .contains("field `type` must be `trade` or `quote`: depth")
        );
    }
}

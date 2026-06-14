use anyhow::{Result, bail};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::Symbol;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Exchange {
    Binance,
}

impl Exchange {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Binance => "binance",
        }
    }

    pub fn parse(value: &str) -> Result<Self> {
        match value {
            "binance" => Ok(Self::Binance),
            _ => bail!("unsupported exchange value: {value}"),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TradeEvent {
    pub symbol: Symbol,
    pub exchange: Exchange,
    pub trade_id: Option<u64>,
    pub price: Decimal,
    pub quantity: Decimal,
    pub event_time: DateTime<Utc>,
    pub ingest_time: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QuoteEvent {
    pub symbol: Symbol,
    pub exchange: Exchange,
    pub top_of_book: TopOfBookQuote,
    pub event_time: DateTime<Utc>,
    pub ingest_time: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TopOfBookQuote {
    pub best_bid_price: Decimal,
    pub best_bid_quantity: Decimal,
    pub best_ask_price: Decimal,
    pub best_ask_quantity: Decimal,
}

impl TradeEvent {
    pub fn new(
        symbol: Symbol,
        exchange: Exchange,
        trade_id: Option<u64>,
        price: Decimal,
        quantity: Decimal,
        event_time: DateTime<Utc>,
        ingest_time: DateTime<Utc>,
    ) -> Result<Self> {
        validate_positive_decimal("trade price", price)?;
        validate_positive_decimal("trade quantity", quantity)?;

        Ok(Self {
            symbol,
            exchange,
            trade_id,
            price,
            quantity,
            event_time,
            ingest_time,
        })
    }
}

impl QuoteEvent {
    pub fn new(
        symbol: Symbol,
        exchange: Exchange,
        top_of_book: TopOfBookQuote,
        event_time: DateTime<Utc>,
        ingest_time: DateTime<Utc>,
    ) -> Result<Self> {
        top_of_book.validate()?;

        Ok(Self {
            symbol,
            exchange,
            top_of_book,
            event_time,
            ingest_time,
        })
    }
}

impl TopOfBookQuote {
    pub fn new(
        best_bid_price: Decimal,
        best_bid_quantity: Decimal,
        best_ask_price: Decimal,
        best_ask_quantity: Decimal,
    ) -> Result<Self> {
        let quote = Self {
            best_bid_price,
            best_bid_quantity,
            best_ask_price,
            best_ask_quantity,
        };
        quote.validate()?;

        Ok(quote)
    }

    fn validate(&self) -> Result<()> {
        validate_positive_decimal("best bid price", self.best_bid_price)?;
        validate_positive_decimal("best bid quantity", self.best_bid_quantity)?;
        validate_positive_decimal("best ask price", self.best_ask_price)?;
        validate_positive_decimal("best ask quantity", self.best_ask_quantity)?;

        if self.best_ask_price < self.best_bid_price {
            bail!("best ask price must be greater than or equal to best bid price");
        }

        Ok(())
    }
}

fn validate_positive_decimal(name: &str, value: Decimal) -> Result<()> {
    if value <= Decimal::ZERO {
        bail!("{name} must be greater than zero");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rust_decimal::Decimal;

    use super::{Exchange, QuoteEvent, TopOfBookQuote, TradeEvent};
    use crate::domain::Symbol;

    #[test]
    fn trade_event_requires_positive_price_and_quantity() {
        let error = TradeEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(42),
            Decimal::ZERO,
            Decimal::new(1, 0),
            Utc::now(),
            Utc::now(),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("trade price must be greater than zero"));
    }

    #[test]
    fn quote_event_rejects_crossed_quotes() {
        let error = TopOfBookQuote::new(
            Decimal::new(101, 0),
            Decimal::new(1, 0),
            Decimal::new(100, 0),
            Decimal::new(1, 0),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("best ask price must be greater than or equal to best bid price"));
    }

    #[test]
    fn quote_event_builds_with_valid_top_of_book() {
        let quote = QuoteEvent::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            TopOfBookQuote::new(
                Decimal::new(100, 0),
                Decimal::new(2, 0),
                Decimal::new(101, 0),
                Decimal::new(3, 0),
            )
            .unwrap(),
            Utc::now(),
            Utc::now(),
        )
        .unwrap();

        assert_eq!(quote.top_of_book.best_bid_price, Decimal::new(100, 0));
        assert_eq!(quote.top_of_book.best_ask_price, Decimal::new(101, 0));
    }
}

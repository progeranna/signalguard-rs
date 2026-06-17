use anyhow::{Result, bail};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{Exchange, Symbol};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderBookSide {
    Bid,
    Ask,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DepthLevel {
    pub price: Decimal,
    pub quantity: Decimal,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DepthUpdate {
    pub symbol: Symbol,
    pub exchange: Exchange,
    pub first_update_id: Option<u64>,
    pub final_update_id: Option<u64>,
    pub bids: Vec<DepthLevel>,
    pub asks: Vec<DepthLevel>,
    pub event_time: DateTime<Utc>,
    pub ingest_time: DateTime<Utc>,
}

impl DepthLevel {
    pub fn new(price: Decimal, quantity: Decimal) -> Result<Self> {
        let level = Self { price, quantity };
        level.validate()?;

        Ok(level)
    }

    fn validate(&self) -> Result<()> {
        if self.price <= Decimal::ZERO {
            bail!("depth level price must be greater than zero");
        }
        if self.quantity < Decimal::ZERO {
            bail!("depth level quantity must be greater than or equal to zero");
        }

        Ok(())
    }
}

impl DepthUpdate {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        symbol: Symbol,
        exchange: Exchange,
        first_update_id: Option<u64>,
        final_update_id: Option<u64>,
        bids: Vec<DepthLevel>,
        asks: Vec<DepthLevel>,
        event_time: DateTime<Utc>,
        ingest_time: DateTime<Utc>,
    ) -> Result<Self> {
        if bids.is_empty() && asks.is_empty() {
            bail!("depth update must contain at least one bid or ask level");
        }

        for level in bids.iter().chain(asks.iter()) {
            level.validate()?;
        }

        if let (Some(first), Some(final_id)) = (first_update_id, final_update_id)
            && final_id < first
        {
            bail!("final_update_id must be greater than or equal to first_update_id");
        }

        Ok(Self {
            symbol,
            exchange,
            first_update_id,
            final_update_id,
            bids,
            asks,
            event_time,
            ingest_time,
        })
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::{DepthLevel, DepthUpdate};
    use crate::domain::{Exchange, Symbol};

    #[test]
    fn valid_depth_level_is_accepted() {
        let level = DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap();

        assert_eq!(level.price, Decimal::new(6500010, 2));
        assert_eq!(level.quantity, Decimal::new(125, 3));
    }

    #[test]
    fn zero_quantity_is_accepted() {
        let level = DepthLevel::new(Decimal::new(6500010, 2), Decimal::ZERO).unwrap();

        assert_eq!(level.quantity, Decimal::ZERO);
    }

    #[test]
    fn zero_price_is_rejected() {
        let error = DepthLevel::new(Decimal::ZERO, Decimal::new(1, 0))
            .unwrap_err()
            .to_string();

        assert!(error.contains("depth level price must be greater than zero"));
    }

    #[test]
    fn negative_price_is_rejected() {
        let error = DepthLevel::new(Decimal::new(-1, 0), Decimal::new(1, 0))
            .unwrap_err()
            .to_string();

        assert!(error.contains("depth level price must be greater than zero"));
    }

    #[test]
    fn negative_quantity_is_rejected() {
        let error = DepthLevel::new(Decimal::new(1, 0), Decimal::new(-1, 0))
            .unwrap_err()
            .to_string();

        assert!(error.contains("depth level quantity must be greater than or equal to zero"));
    }

    #[test]
    fn valid_depth_update_with_bids_is_accepted() {
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(10),
            Some(12),
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![],
            test_time(0),
            test_time(1),
        )
        .unwrap();

        assert_eq!(update.bids.len(), 1);
        assert!(update.asks.is_empty());
    }

    #[test]
    fn valid_depth_update_with_asks_is_accepted() {
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(10),
            Some(10),
            vec![],
            vec![DepthLevel::new(Decimal::new(6500020, 2), Decimal::new(175, 3)).unwrap()],
            test_time(0),
            test_time(1),
        )
        .unwrap();

        assert!(update.bids.is_empty());
        assert_eq!(update.asks.len(), 1);
    }

    #[test]
    fn valid_depth_update_with_both_sides_is_accepted() {
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(10),
            Some(11),
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![DepthLevel::new(Decimal::new(6500020, 2), Decimal::new(175, 3)).unwrap()],
            test_time(0),
            test_time(1),
        )
        .unwrap();

        assert_eq!(update.bids.len(), 1);
        assert_eq!(update.asks.len(), 1);
    }

    #[test]
    fn empty_bids_and_asks_are_rejected() {
        let error = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(10),
            Some(11),
            vec![],
            vec![],
            test_time(0),
            test_time(1),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("depth update must contain at least one bid or ask level"));
    }

    #[test]
    fn invalid_update_id_range_is_rejected() {
        let error = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(12),
            Some(11),
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![],
            test_time(0),
            test_time(1),
        )
        .unwrap_err()
        .to_string();

        assert!(error.contains("final_update_id must be greater than or equal to first_update_id"));
    }

    #[test]
    fn equal_update_ids_are_accepted() {
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(12),
            Some(12),
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![],
            test_time(0),
            test_time(1),
        )
        .unwrap();

        assert_eq!(update.first_update_id, Some(12));
        assert_eq!(update.final_update_id, Some(12));
    }

    fn test_time(second: u32) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
    }
}

use crate::domain::{DepthUpdate, QuoteEvent, TradeEvent};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IngestionSource {
    Replay,
    Binance,
}

#[derive(Clone, Debug, PartialEq)]
pub enum NormalizedEvent {
    Trade(TradeEvent),
    Quote(QuoteEvent),
    Depth(DepthUpdate),
}

#[derive(Clone, Debug, PartialEq)]
pub struct IngestedEvent {
    pub source: IngestionSource,
    pub event: NormalizedEvent,
}

impl IngestedEvent {
    pub fn new(source: IngestionSource, event: NormalizedEvent) -> Self {
        Self { source, event }
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};
    use rust_decimal::Decimal;

    use super::NormalizedEvent;
    use crate::domain::{DepthLevel, DepthUpdate, Exchange, Symbol};

    #[test]
    fn normalized_event_depth_carries_expected_update() {
        let update = DepthUpdate::new(
            Symbol::new("BTCUSDT").unwrap(),
            Exchange::Binance,
            Some(100),
            Some(101),
            vec![DepthLevel::new(Decimal::new(6500010, 2), Decimal::new(125, 3)).unwrap()],
            vec![],
            test_time(0),
            test_time(1),
        )
        .unwrap();

        let event = NormalizedEvent::Depth(update.clone());

        match event {
            NormalizedEvent::Depth(depth) => assert_eq!(depth, update),
            other => panic!("expected depth event, got {other:?}"),
        }
    }

    fn test_time(second: u32) -> chrono::DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
    }
}

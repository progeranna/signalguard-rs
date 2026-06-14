use crate::domain::{QuoteEvent, TradeEvent};

#[derive(Clone, Debug, PartialEq)]
pub enum NormalizedEvent {
    Trade(TradeEvent),
    Quote(QuoteEvent),
}

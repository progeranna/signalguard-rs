use std::{collections::HashMap, str::FromStr};

use chrono::{DateTime, TimeZone, Utc};
use rust_decimal::Decimal;
use uuid::Uuid;

use crate::{
    config::{DetectorSettings, HealthScoreSettings},
    domain::{
        AnomalyEvent, AnomalyType, DepthLevel, DepthUpdate, Exchange, MarketState, QuoteEvent,
        Severity, Symbol, TopOfBookQuote, TradeEvent,
    },
    health::{HealthScoringInput, evaluate_health},
    ingestion::NormalizedEvent,
    state::MarketStateAggregator,
};

use super::dto::{
    AnomalyResponse, DashboardHealthSummary, DashboardServiceSummary, DashboardStateSummary,
    DashboardSummaryResponse, DashboardSymbolSummary, MarketTimelinePointResponse,
    MarketTimelineResponse, PipelineHealthResponse, PipelineHealthStatus,
};

const DEMO_MARKETS: [&str; 7] = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT",
];

pub fn dashboard_summary(
    health_settings: &HealthScoreSettings,
    detector_settings: &DetectorSettings,
) -> DashboardSummaryResponse {
    let dataset = build_demo_dataset();
    let now = demo_now();

    let symbols = DEMO_MARKETS
        .iter()
        .map(|symbol_name| {
            let symbol = symbol(symbol_name);
            let state = dataset.states.get(&symbol);
            let symbol_anomalies = dataset
                .anomalies
                .iter()
                .filter(|anomaly| anomaly.symbol == symbol)
                .cloned()
                .collect::<Vec<_>>();

            let health = state.map(|market_state| {
                DashboardHealthSummary::from_evaluation(evaluate_health(HealthScoringInput {
                    state: market_state,
                    anomalies: &symbol_anomalies,
                    now,
                    settings: health_settings,
                    stale_data_ms_threshold: detector_settings.stale_data_ms_threshold,
                }))
            });

            DashboardSymbolSummary {
                symbol: symbol.as_str().to_owned(),
                state: state.map(|market_state| {
                    DashboardStateSummary::from_market_state(market_state, now)
                }),
                health,
            }
        })
        .collect();

    DashboardSummaryResponse {
        service: DashboardServiceSummary {
            status: "ok",
            service: "signalguard-rs",
        },
        pipeline: PipelineHealthResponse {
            status: PipelineHealthStatus::Healthy,
            last_message_age_ms: Some(1_000),
            parse_errors: 0,
            reconnect_attempts: 0,
            storage_errors: 0,
            cache_errors: 0,
        },
        symbols,
        recent_anomalies: dataset
            .anomalies
            .into_iter()
            .map(AnomalyResponse::from_anomaly)
            .collect(),
    }
}

pub fn market_timeline(symbol: &Symbol) -> MarketTimelineResponse {
    let dataset = build_demo_dataset();
    let now = demo_now();
    let points = dataset
        .timeline_trades
        .get(symbol)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|trade| MarketTimelinePointResponse::from_trade(&trade, now))
        .collect::<Vec<_>>();
    let anomalies = if points.is_empty() {
        Vec::new()
    } else {
        dataset
            .anomalies
            .into_iter()
            .filter(|anomaly| anomaly.symbol == *symbol)
            .map(AnomalyResponse::from_anomaly)
            .collect()
    };

    MarketTimelineResponse {
        symbol: symbol.as_str().to_owned(),
        points,
        anomalies,
    }
}

struct DemoDataset {
    states: HashMap<Symbol, MarketState>,
    timeline_trades: HashMap<Symbol, Vec<TradeEvent>>,
    anomalies: Vec<AnomalyEvent>,
}

fn build_demo_dataset() -> DemoDataset {
    let summary_trades = demo_summary_trades();
    let timeline_trades = demo_timeline_trades(&summary_trades);
    let recent_anomalies = demo_anomalies();
    let mut aggregator = MarketStateAggregator::default();

    for trades in summary_trades.values() {
        for trade in trades {
            aggregator.apply(&NormalizedEvent::Trade(trade.clone()));
        }
    }

    for event in demo_quote_events() {
        aggregator.apply(&NormalizedEvent::Quote(event));
    }

    for event in demo_depth_events() {
        aggregator.apply(&NormalizedEvent::Depth(event));
    }

    let states = DEMO_MARKETS
        .iter()
        .map(|symbol_name| {
            let symbol = symbol(symbol_name);
            let state = aggregator
                .snapshot(&symbol)
                .unwrap_or_else(|| MarketState::new(symbol.clone()));

            (symbol, state)
        })
        .collect();

    DemoDataset {
        states,
        timeline_trades,
        anomalies: recent_anomalies,
    }
}

fn demo_summary_trades() -> HashMap<Symbol, Vec<TradeEvent>> {
    HashMap::from([
        (
            symbol("BTCUSDT"),
            vec![
                trade("BTCUSDT", 1, "64980.00", "0.120", 50),
                trade("BTCUSDT", 2, "65005.25", "0.150", 51),
                trade("BTCUSDT", 3, "65022.10", "0.175", 52),
                trade("BTCUSDT", 4, "65040.40", "0.090", 53),
                trade("BTCUSDT", 5, "65048.75", "0.240", 54),
                trade("BTCUSDT", 6, "65054.25", "0.220", 55),
            ],
        ),
        (
            symbol("ETHUSDT"),
            vec![
                trade("ETHUSDT", 101, "3494.20", "1.250", 51),
                trade("ETHUSDT", 102, "3498.10", "0.950", 52),
                trade("ETHUSDT", 103, "3501.75", "1.100", 53),
                trade("ETHUSDT", 104, "3506.40", "1.400", 54),
                trade("ETHUSDT", 105, "3510.80", "0.850", 55),
                trade("ETHUSDT", 106, "3514.75", "2.000", 56),
            ],
        ),
        (
            symbol("SOLUSDT"),
            vec![
                trade("SOLUSDT", 201, "149.10", "5.500", 55),
                trade("SOLUSDT", 202, "149.85", "4.750", 58),
            ],
        ),
        (
            symbol("XRPUSDT"),
            vec![
                trade("XRPUSDT", 301, "0.6230", "850.000", 55),
                trade("XRPUSDT", 302, "0.6265", "920.000", 58),
            ],
        ),
        (
            symbol("BNBUSDT"),
            vec![
                trade("BNBUSDT", 401, "573.20", "1.700", 55),
                trade("BNBUSDT", 402, "574.60", "2.100", 58),
            ],
        ),
        (
            symbol("ADAUSDT"),
            vec![
                trade("ADAUSDT", 501, "0.8120", "1200.000", 49),
                trade("ADAUSDT", 502, "0.8105", "950.000", 50),
            ],
        ),
        (
            symbol("DOGEUSDT"),
            vec![
                trade("DOGEUSDT", 601, "0.1740", "2800.000", 55),
                trade("DOGEUSDT", 602, "0.1795", "3100.000", 58),
            ],
        ),
    ])
}

fn demo_timeline_trades(
    summary_trades: &HashMap<Symbol, Vec<TradeEvent>>,
) -> HashMap<Symbol, Vec<TradeEvent>> {
    [symbol("BTCUSDT"), symbol("ETHUSDT")]
        .into_iter()
        .filter_map(|symbol| {
            summary_trades
                .get(&symbol)
                .cloned()
                .map(|trades| (symbol, trades))
        })
        .collect()
}

fn demo_quote_events() -> Vec<QuoteEvent> {
    vec![
        quote("BTCUSDT", "65048.00", "0.95", "65055.00", "0.90", 56),
        quote("ETHUSDT", "3512.10", "5.50", "3515.60", "4.80", 57),
        quote("SOLUSDT", "149.72", "42.00", "149.88", "38.50", 58),
        quote("XRPUSDT", "0.6264", "4500.000", "0.6268", "3900.000", 58),
        quote("BNBUSDT", "574.40", "8.400", "574.70", "6.900", 58),
        quote("ADAUSDT", "0.8102", "7600.000", "0.8108", "6800.000", 50),
        quote("DOGEUSDT", "0.1792", "15000.000", "0.1801", "12000.000", 58),
    ]
}

fn demo_depth_events() -> Vec<DepthUpdate> {
    vec![
        depth(
            "BTCUSDT",
            Some(100),
            Some(101),
            vec![("65048.00", "1.20"), ("65047.50", "0")],
            vec![("65055.00", "0.80")],
            57,
        ),
        depth(
            "BTCUSDT",
            Some(103),
            Some(104),
            vec![("65048.00", "0.95")],
            vec![("65055.50", "1.10"), ("65056.00", "0")],
            58,
        ),
    ]
}

fn demo_anomalies() -> Vec<AnomalyEvent> {
    let mut anomalies = vec![
        anomaly(
            "DOGEUSDT",
            "71b3ff30-8fec-4f52-8db4-0d3139cb97e4",
            AnomalyType::PriceMove,
            Severity::Critical,
            "historical demo move exceeded the configured one-minute threshold",
            (Some(3.16), Some(2.5)),
            58,
        ),
        anomaly(
            "BTCUSDT",
            "3d6ce59a-fd8b-4180-9864-08933b9d4168",
            AnomalyType::SpreadSpike,
            Severity::Warning,
            "historical demo spread widened during the replay snapshot",
            (Some(0.11), Some(0.05)),
            58,
        ),
        anomaly(
            "ADAUSDT",
            "0be45a49-3788-4582-9ddf-f64f6fce65d6",
            AnomalyType::StaleData,
            Severity::Info,
            "historical demo feed paused long enough to mark the market state stale",
            (Some(9_000.0), Some(5_000.0)),
            58,
        ),
    ];
    anomalies.sort_by_key(|event| std::cmp::Reverse(event.created_at));
    anomalies
}

fn anomaly(
    symbol_name: &str,
    id: &str,
    anomaly_type: AnomalyType,
    severity: Severity,
    message: &str,
    measurement: (Option<f64>, Option<f64>),
    second: u32,
) -> AnomalyEvent {
    let (observed_value, threshold_value) = measurement;

    AnomalyEvent {
        id: Uuid::parse_str(id).unwrap(),
        symbol: symbol(symbol_name),
        anomaly_type,
        severity,
        message: String::from(message),
        observed_value,
        threshold_value,
        event_time: demo_time(second),
        created_at: demo_time(second),
    }
}

fn trade(symbol_name: &str, trade_id: u64, price: &str, quantity: &str, second: u32) -> TradeEvent {
    TradeEvent::new(
        symbol(symbol_name),
        Exchange::Binance,
        Some(trade_id),
        decimal(price),
        decimal(quantity),
        demo_time(second),
        demo_time(second),
    )
    .unwrap()
}

fn quote(
    symbol_name: &str,
    best_bid_price: &str,
    best_bid_quantity: &str,
    best_ask_price: &str,
    best_ask_quantity: &str,
    second: u32,
) -> QuoteEvent {
    QuoteEvent::new(
        symbol(symbol_name),
        Exchange::Binance,
        TopOfBookQuote::new(
            decimal(best_bid_price),
            decimal(best_bid_quantity),
            decimal(best_ask_price),
            decimal(best_ask_quantity),
        )
        .unwrap(),
        demo_time(second),
        demo_time(second),
    )
    .unwrap()
}

fn depth(
    symbol_name: &str,
    first_update_id: Option<u64>,
    final_update_id: Option<u64>,
    bids: Vec<(&str, &str)>,
    asks: Vec<(&str, &str)>,
    second: u32,
) -> DepthUpdate {
    DepthUpdate::new(
        symbol(symbol_name),
        Exchange::Binance,
        first_update_id,
        final_update_id,
        bids.into_iter()
            .map(|(price, quantity)| depth_level(price, quantity))
            .collect(),
        asks.into_iter()
            .map(|(price, quantity)| depth_level(price, quantity))
            .collect(),
        demo_time(second),
        demo_time(second),
    )
    .unwrap()
}

fn depth_level(price: &str, quantity: &str) -> DepthLevel {
    DepthLevel::new(decimal(price), decimal(quantity)).unwrap()
}

fn symbol(value: &str) -> Symbol {
    Symbol::new(value).unwrap()
}

fn decimal(value: &str) -> Decimal {
    Decimal::from_str(value).unwrap()
}

fn demo_now() -> DateTime<Utc> {
    demo_time(59)
}

fn demo_time(second: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, second).unwrap()
}

#[cfg(test)]
mod tests {
    use super::{dashboard_summary, market_timeline, symbol};
    use crate::config::{
        DetectorSettings, HealthScoreSettings, HealthStatusThresholds, SeverityPenaltySettings,
    };
    use rust_decimal::Decimal;

    #[test]
    fn dashboard_summary_includes_canonical_demo_markets() {
        let summary = dashboard_summary(&health_settings(), &detector_settings());

        assert_eq!(summary.symbols.len(), 7);
        assert_eq!(summary.symbols[0].symbol, "BTCUSDT");
        assert_eq!(summary.symbols[1].symbol, "ETHUSDT");
        assert_eq!(summary.symbols[6].symbol, "DOGEUSDT");
        assert!(!summary.recent_anomalies.is_empty());
    }

    #[test]
    fn market_timeline_returns_empty_points_for_supported_market_without_history() {
        let response = market_timeline(&symbol("ADAUSDT"));

        assert_eq!(response.symbol, "ADAUSDT");
        assert!(response.points.is_empty());
        assert!(response.anomalies.is_empty());
    }

    fn detector_settings() -> DetectorSettings {
        DetectorSettings {
            price_move_1m_pct_threshold: Decimal::new(25, 1),
            spread_spike_pct_threshold: Decimal::new(5, 1),
            stale_data_ms_threshold: 5_000,
            trade_burst_multiplier: Decimal::new(3, 0),
            trade_burst_min_warmup_windows: 5,
            quote_stuck_ms_threshold: 10_000,
            event_lag_spike_ms_threshold: 3_000,
            depth_sequence_gap_min_increment: 1,
        }
    }

    fn health_settings() -> HealthScoreSettings {
        HealthScoreSettings {
            base_score: 100,
            severity_penalties: SeverityPenaltySettings {
                info: 5,
                warning: 15,
                critical: 35,
            },
            stale_data_penalty: 25,
            recent_anomaly_window_secs: 300,
            status_thresholds: HealthStatusThresholds {
                healthy_min_score: 80,
                degraded_min_score: 50,
            },
        }
    }
}

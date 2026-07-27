use serde_json::{Map, Value, json};

pub const HEALTH: &str = "/health";
pub const RUNTIME_MODE: &str = "/runtime/mode";
pub const METRICS: &str = "/metrics";
pub const PIPELINE_HEALTH: &str = "/pipeline/health";
pub const DASHBOARD_SUMMARY: &str = "/dashboard/summary";
pub const SYMBOLS: &str = "/symbols";
pub const MARKET_STATE: &str = "/market/{symbol}/state";
pub const MARKET_HEALTH: &str = "/market/{symbol}/health";
pub const MARKET_TIMELINE: &str = "/market/{symbol}/timeline";
pub const ANOMALIES: &str = "/anomalies";

pub const ARTIFACT_PATH: &str = "contracts/web-console.openapi.json";

fn schema(ty: &str) -> Value {
    json!({"type": ty})
}
fn string() -> Value {
    schema("string")
}
fn nullable(mut value: Value) -> Value {
    value["nullable"] = json!(true);
    value
}
fn array(items: Value) -> Value {
    json!({"type":"array","items":items})
}
fn object(properties: Map<String, Value>, required: &[&str]) -> Value {
    let mut value = json!({"type":"object","properties":properties});
    if !required.is_empty() {
        value["required"] = json!(required);
    }
    value["additionalProperties"] = json!(true);
    value
}
fn props(items: &[(&str, Value)]) -> Map<String, Value> {
    items
        .iter()
        .map(|(name, value)| ((*name).to_owned(), value.clone()))
        .collect()
}
fn ref_schema(name: &str) -> Value {
    json!({"$ref": format!("#/components/schemas/{name}")})
}
fn response(name: &str) -> Value {
    json!({"description":"OK","content":{"application/json":{"schema":{"$ref":format!("#/components/schemas/{name}")}}}})
}
fn query(name: &str, schema: Value) -> Value {
    json!({"name":name,"in":"query","required":false,"schema":schema})
}
fn path_param() -> Value {
    json!({"name":"symbol","in":"path","required":true,"schema":{"type":"string","pattern":"^[A-Za-z0-9]+$"}})
}

pub fn document() -> Value {
    let decimal = json!({"type":"string","description":"rust_decimal JSON serialization"});
    let date_time = json!({"type":"string","format":"date-time"});
    let nullable_decimal = nullable(decimal.clone());
    let nullable_number = nullable(schema("number"));
    let nullable_date_time = nullable(date_time.clone());
    let health_status = json!({"type":"string","enum":["healthy","degraded","unhealthy"]});
    let severity = json!({"type":"string","enum":["info","warning","critical"]});
    let mut schemas = Map::new();
    schemas.insert(
        "HealthResponse".into(),
        object(
            props(&[
                ("status", json!({"type":"string","enum":["ok"]})),
                (
                    "service",
                    json!({"type":"string","enum":["signalguard-rs"]}),
                ),
            ]),
            &["status", "service"],
        ),
    );
    schemas.insert(
        "SymbolsResponse".into(),
        object(props(&[("symbols", array(string()))]), &["symbols"]),
    );
    schemas.insert("RuntimeModeResponse".into(), object(props(&[("mode",json!({"type":"string","enum":["replay","live"]})),("mode_label",string()),("status",json!({"type":"string","enum":["starting","running","switching","failed","stopped","completed"]})),("symbols",array(string())),("switching_supported",schema("boolean")),("source",json!({"type":"string","enum":["config","runtime"]})),("last_started_at",date_time.clone()),("last_switched_at",nullable_date_time.clone()),("last_error",nullable(string()))]), &["mode","mode_label","status","symbols","switching_supported","source","last_started_at","last_switched_at","last_error"]));
    schemas.insert(
        "RuntimeModeSwitchRequest".into(),
        object(
            props(&[
                ("mode", json!({"type":"string","enum":["replay","live"]})),
                ("symbols", array(string())),
                ("reset_state", schema("boolean")),
                ("reset_storage", schema("boolean")),
            ]),
            &["mode"],
        ),
    );
    schemas.insert(
        "PipelineHealthResponse".into(),
        object(
            props(&[
                (
                    "status",
                    json!({"type":"string","enum":["healthy","degraded","unhealthy"]}),
                ),
                ("last_message_age_ms", nullable(schema("integer"))),
                ("parse_errors", schema("integer")),
                ("reconnect_attempts", schema("integer")),
                ("storage_errors", schema("integer")),
                ("cache_errors", schema("integer")),
            ]),
            &[
                "status",
                "last_message_age_ms",
                "parse_errors",
                "reconnect_attempts",
                "storage_errors",
                "cache_errors",
            ],
        ),
    );
    schemas.insert(
        "AnomalyResponse".into(),
        object(
            props(&[
                ("id", json!({"type":"string","format":"uuid"})),
                ("symbol", string()),
                ("anomaly_type", string()),
                ("severity", severity.clone()),
                ("message", string()),
                ("observed_value", nullable_number.clone()),
                ("threshold_value", nullable_number.clone()),
                ("event_time", date_time.clone()),
                ("created_at", date_time.clone()),
            ]),
            &[
                "id",
                "symbol",
                "anomaly_type",
                "severity",
                "message",
                "observed_value",
                "threshold_value",
                "event_time",
                "created_at",
            ],
        ),
    );
    let state_props = [
        ("last_trade_price", nullable_decimal.clone()),
        ("best_bid_price", nullable_decimal.clone()),
        ("best_ask_price", nullable_decimal.clone()),
        ("spread_pct", nullable_number.clone()),
        ("price_change_1m_pct", nullable_number.clone()),
        ("trades_per_minute", nullable_number.clone()),
        ("last_event_time", nullable_date_time.clone()),
        ("last_event_age_ms", nullable(schema("integer"))),
        ("depth_sequence_gap_count", schema("integer")),
    ];
    let state_required = [
        "last_trade_price",
        "best_bid_price",
        "best_ask_price",
        "spread_pct",
        "price_change_1m_pct",
        "trades_per_minute",
        "last_event_time",
        "last_event_age_ms",
        "depth_sequence_gap_count",
    ];
    schemas.insert(
        "DashboardStateSummary".into(),
        object(props(&state_props), &state_required),
    );
    schemas.insert(
        "DashboardHealthSummary".into(),
        object(
            props(&[
                ("score", json!({"type":"integer","minimum":0,"maximum":100})),
                ("status", health_status.clone()),
                ("recent_anomaly_count", schema("integer")),
                ("evaluated_at", date_time.clone()),
            ]),
            &["score", "status", "recent_anomaly_count", "evaluated_at"],
        ),
    );
    schemas.insert(
        "DashboardSymbolSummary".into(),
        object(
            props(&[
                ("symbol", string()),
                ("state", nullable(ref_schema("DashboardStateSummary"))),
                ("health", nullable(ref_schema("DashboardHealthSummary"))),
            ]),
            &["symbol", "state", "health"],
        ),
    );
    schemas.insert(
        "DashboardSummaryResponse".into(),
        object(
            props(&[
                ("service", ref_schema("HealthResponse")),
                ("pipeline", ref_schema("PipelineHealthResponse")),
                ("symbols", array(ref_schema("DashboardSymbolSummary"))),
                ("recent_anomalies", array(ref_schema("AnomalyResponse"))),
            ]),
            &["service", "pipeline", "symbols", "recent_anomalies"],
        ),
    );
    schemas.insert(
        "MarketStateResponse".into(),
        object(
            props(&[
                ("symbol", string()),
                ("last_trade_price", nullable_decimal.clone()),
                ("last_trade_quantity", nullable_decimal.clone()),
                ("best_bid_price", nullable_decimal.clone()),
                ("best_bid_quantity", nullable_decimal.clone()),
                ("best_ask_price", nullable_decimal.clone()),
                ("best_ask_quantity", nullable_decimal.clone()),
                ("top_bid_quantity", nullable_decimal.clone()),
                ("top_ask_quantity", nullable_decimal.clone()),
                ("top_bid_liquidity", nullable_decimal.clone()),
                ("top_ask_liquidity", nullable_decimal.clone()),
                ("book_imbalance", nullable_decimal),
                ("depth_sequence_gap_count", schema("integer")),
                ("last_depth_event_time", nullable_date_time.clone()),
                ("last_depth_ingest_time", nullable_date_time.clone()),
                ("spread_pct", nullable_number.clone()),
                ("price_change_1m_pct", nullable_number.clone()),
                ("trades_per_minute", nullable_number.clone()),
                ("last_event_time", nullable_date_time.clone()),
                ("last_ingest_time", nullable_date_time.clone()),
                ("last_event_age_ms", nullable(schema("integer"))),
            ]),
            &[
                "symbol",
                "last_trade_price",
                "last_trade_quantity",
                "best_bid_price",
                "best_bid_quantity",
                "best_ask_price",
                "best_ask_quantity",
                "top_bid_quantity",
                "top_ask_quantity",
                "top_bid_liquidity",
                "top_ask_liquidity",
                "book_imbalance",
                "depth_sequence_gap_count",
                "last_depth_event_time",
                "last_depth_ingest_time",
                "spread_pct",
                "price_change_1m_pct",
                "trades_per_minute",
                "last_event_time",
                "last_ingest_time",
                "last_event_age_ms",
            ],
        ),
    );
    schemas.insert(
        "MarketHealthSignals".into(),
        object(
            props(&[
                ("spread_pct", nullable_number.clone()),
                ("price_change_1m_pct", nullable_number.clone()),
                ("trades_per_minute", nullable_number.clone()),
                ("last_event_time", nullable_date_time.clone()),
                ("last_event_age_ms", nullable(schema("integer"))),
            ]),
            &[
                "spread_pct",
                "price_change_1m_pct",
                "trades_per_minute",
                "last_event_time",
                "last_event_age_ms",
            ],
        ),
    );
    schemas.insert(
        "HealthPenalty".into(),
        object(
            props(&[
                ("reason", string()),
                ("penalty", schema("integer")),
                ("anomaly_type", nullable(string())),
                ("severity", nullable(severity)),
                ("observed_value", nullable_number.clone()),
                ("threshold_value", nullable_number.clone()),
                ("event_time", nullable_date_time),
            ]),
            &[
                "reason",
                "penalty",
                "anomaly_type",
                "severity",
                "observed_value",
                "threshold_value",
                "event_time",
            ],
        ),
    );
    schemas.insert(
        "MarketHealthResponse".into(),
        object(
            props(&[
                ("symbol", string()),
                ("score", schema("integer")),
                ("base_score", schema("integer")),
                ("status", health_status),
                ("evaluated_at", date_time.clone()),
                ("recent_anomaly_count", schema("integer")),
                ("signals", ref_schema("MarketHealthSignals")),
                ("penalties", array(ref_schema("HealthPenalty"))),
            ]),
            &[
                "symbol",
                "score",
                "base_score",
                "status",
                "evaluated_at",
                "recent_anomaly_count",
                "signals",
                "penalties",
            ],
        ),
    );
    schemas.insert(
        "MarketTimelinePointResponse".into(),
        object(
            props(&[
                ("timestamp", date_time),
                ("price", decimal),
                ("spread_pct", nullable_number.clone()),
                ("trades_per_minute", nullable_number),
                ("last_event_age_ms", nullable(schema("integer"))),
            ]),
            &[
                "timestamp",
                "price",
                "spread_pct",
                "trades_per_minute",
                "last_event_age_ms",
            ],
        ),
    );
    schemas.insert(
        "MarketTimelineResponse".into(),
        object(
            props(&[
                ("symbol", string()),
                ("points", array(ref_schema("MarketTimelinePointResponse"))),
                ("anomalies", array(ref_schema("AnomalyResponse"))),
            ]),
            &["symbol", "points", "anomalies"],
        ),
    );
    schemas.insert(
        "AnomaliesResponse".into(),
        object(
            props(&[("anomalies", array(ref_schema("AnomalyResponse")))]),
            &["anomalies"],
        ),
    );

    let mode = query("mode", json!({"type":"string","enum":["demo","live"]}));
    let mut paths = Map::new();
    paths.insert(
        HEALTH.into(),
        json!({"get":{"operationId":"getHealth","responses":{"200":response("HealthResponse")}}}),
    );
    paths.insert(RUNTIME_MODE.into(), json!({"get":{"operationId":"getRuntimeMode","responses":{"200":response("RuntimeModeResponse")}},"post":{"operationId":"postRuntimeMode","requestBody":{"required":true,"content":{"application/json":{"schema":ref_schema("RuntimeModeSwitchRequest")}}},"responses":{"200":response("RuntimeModeResponse")}}}));
    paths.insert(PIPELINE_HEALTH.into(), json!({"get":{"operationId":"getPipelineHealth","responses":{"200":response("PipelineHealthResponse")}}}));
    paths.insert(DASHBOARD_SUMMARY.into(), json!({"get":{"operationId":"getDashboardSummary","parameters":[mode],"responses":{"200":response("DashboardSummaryResponse")}}}));
    paths.insert(
        SYMBOLS.into(),
        json!({"get":{"operationId":"getSymbols","responses":{"200":response("SymbolsResponse")}}}),
    );
    paths.insert(MARKET_STATE.into(), json!({"get":{"operationId":"getMarketState","parameters":[path_param()],"responses":{"200":response("MarketStateResponse")}}}));
    paths.insert(MARKET_HEALTH.into(), json!({"get":{"operationId":"getMarketHealth","parameters":[path_param()],"responses":{"200":response("MarketHealthResponse")}}}));
    paths.insert(MARKET_TIMELINE.into(), json!({"get":{"operationId":"getMarketTimeline","parameters":[path_param(),mode],"responses":{"200":response("MarketTimelineResponse")}}}));
    paths.insert(ANOMALIES.into(), json!({"get":{"operationId":"getAnomalies","parameters":[query("symbol",string()),query("limit",json!({"type":"string","pattern":"^[0-9]+$"}))],"responses":{"200":response("AnomaliesResponse")}}}));
    json!({"openapi":"3.0.3","info":{"title":"SignalGuard web console API","version":"0.4.0"},"paths":paths,"components":{"schemas":schemas},"x-signalguard-metrics":{"path":METRICS,"method":"GET","contentType":"text/plain; version=0.0.4; charset=utf-8","description":"Prometheus text endpoint; excluded from JSON schemas."}})
}

pub fn render() -> Vec<u8> {
    let mut bytes = serde_json::to_vec_pretty(&document()).expect("contract JSON is serializable");
    bytes.push(b'\n');
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn generation_is_deterministic() {
        assert_eq!(render(), render());
    }
    #[test]
    fn inventory_is_complete() {
        let contract = document();
        let paths = contract["paths"].as_object().unwrap();
        assert_eq!(paths.len(), 9);
        assert!(paths.contains_key(MARKET_STATE));
        assert!(paths[MARKET_STATE]["get"]["parameters"][0]["name"] == "symbol");
    }
    #[test]
    fn schema_semantics_are_explicit() {
        let schemas = &document()["components"]["schemas"];
        assert_eq!(
            schemas["MarketStateResponse"]["properties"]["last_trade_price"]["type"],
            "string"
        );
        assert_eq!(
            schemas["MarketStateResponse"]["properties"]["last_trade_price"]["nullable"],
            true
        );
        assert_eq!(
            schemas["AnomalyResponse"]["properties"]["id"]["format"],
            "uuid"
        );
        assert_eq!(
            schemas["RuntimeModeResponse"]["properties"]["last_started_at"]["format"],
            "date-time"
        );
        assert_eq!(
            schemas["AnomalyResponse"]["properties"]["severity"]["enum"],
            json!(["info", "warning", "critical"])
        );
    }
}

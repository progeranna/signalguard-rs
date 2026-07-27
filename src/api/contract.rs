use std::collections::BTreeMap;

use schemars::{JsonSchema, schema_for};
use serde_json::{Map, Value, json};

use super::dto::{
    AnomaliesResponse, AnomalyResponse, DashboardHealthSummary, DashboardStateSummary,
    DashboardSummaryResponse, DashboardSymbolSummary, HealthResponse, MarketHealthResponse,
    MarketStateResponse, MarketTimelinePointResponse, MarketTimelineResponse,
    PipelineHealthResponse, RuntimeModeResponse, RuntimeModeSwitchRequest, SymbolsResponse,
};

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

fn generated<T: JsonSchema>() -> (Value, BTreeMap<String, Value>) {
    let mut root = serde_json::to_value(schema_for!(T)).expect("schema is serializable");
    let definitions = root
        .as_object_mut()
        .and_then(|object| object.remove("definitions"))
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut definitions = definitions.into_iter().collect::<BTreeMap<_, _>>();
    normalize_refs(&mut root);
    for schema in definitions.values_mut() {
        normalize_refs(schema);
    }
    if let Some(object) = root.as_object_mut() {
        object.remove("$schema");
    }
    (root, definitions)
}

fn normalize_refs(value: &mut Value) {
    match value {
        Value::Object(object) => {
            if let Some(any_of) = object.remove("anyOf") {
                if let Some(items) = any_of.as_array() {
                    if items.len() == 2 && items.iter().any(|item| item == &json!({"type":"null"}))
                    {
                        if let Some(reference) =
                            items.iter().find(|item| item.get("$ref").is_some())
                        {
                            object.insert("allOf".into(), json!([reference]));
                            object.insert("nullable".into(), json!(true));
                        } else {
                            object.insert("anyOf".into(), any_of);
                        }
                    } else {
                        object.insert("anyOf".into(), any_of);
                    }
                } else {
                    object.insert("anyOf".into(), any_of);
                }
            }
            if let Some(Value::Array(types)) = object.get_mut("type")
                && types.len() == 2
                && types.iter().any(|item| item == "null")
                && let Some(non_null) = types.iter().find(|item| *item != "null").cloned()
            {
                object.insert("type".into(), non_null);
                object.insert("nullable".into(), json!(true));
            }
            object.values_mut().for_each(normalize_refs)
        }
        Value::Array(array) => array.iter_mut().for_each(normalize_refs),
        Value::String(string) => {
            if let Some(name) = string.strip_prefix("#/definitions/") {
                *string = format!("#/components/schemas/{name}");
            }
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => {}
    }
}

fn add_schema(
    schemas: &mut BTreeMap<String, Value>,
    name: &str,
    generated_schema: (Value, BTreeMap<String, Value>),
) {
    let (root, definitions) = generated_schema;
    for (definition_name, definition) in definitions {
        schemas.entry(definition_name).or_insert(definition);
    }
    schemas.insert(name.to_owned(), root);
}

fn ref_schema(name: &str) -> Value {
    json!({"$ref": format!("#/components/schemas/{name}")})
}

fn response(name: &str) -> Value {
    json!({"description":"OK","content":{"application/json":{"schema":ref_schema(name)}}})
}

#[derive(Clone, Copy)]
enum ErrorResponseKind {
    HandlerJson,
    ExtractorText,
}

fn error_content(kind: ErrorResponseKind) -> (&'static str, Value) {
    match kind {
        ErrorResponseKind::HandlerJson => ("application/json", ref_schema("ApiErrorResponse")),
        ErrorResponseKind::ExtractorText => (
            "text/plain; charset=utf-8",
            ref_schema("ExtractorRejectionBody"),
        ),
    }
}

fn error_response(kind: ErrorResponseKind) -> Value {
    let (media_type, schema) = error_content(kind);
    json!({"description":"API error","content":{media_type:{"schema":schema}}})
}

fn query(name: &str, schema: Value) -> Value {
    json!({"name":name,"in":"query","required":false,"schema":schema})
}

fn path_param() -> Value {
    json!({"name":"symbol","in":"path","required":true,"schema":{"type":"string","pattern":"^[A-Za-z0-9]+$"}})
}

fn required_nullable(schemas: &mut BTreeMap<String, Value>, schema_name: &str, fields: &[&str]) {
    let schema = schemas
        .get_mut(schema_name)
        .expect("generated schema exists");
    {
        let required = schema["required"]
            .as_array_mut()
            .expect("required properties");
        for field in fields {
            if !required.iter().any(|value| value == field) {
                required.push(json!(field));
            }
        }
    }
    let properties = schema["properties"]
        .as_object_mut()
        .expect("object properties");
    for field in fields {
        let property = properties
            .get_mut(*field)
            .expect("generated property exists");
        if property.get("$ref").is_some() {
            let reference = property.take();
            *property = json!({"allOf":[reference],"nullable":true});
        } else {
            property["nullable"] = json!(true);
        }
    }
}

fn required_non_nullable(
    schemas: &mut BTreeMap<String, Value>,
    schema_name: &str,
    fields: &[&str],
) {
    let schema = schemas
        .get_mut(schema_name)
        .expect("generated schema exists");
    {
        let required = schema["required"]
            .as_array_mut()
            .expect("required properties");
        for field in fields {
            if !required.iter().any(|value| value == field) {
                required.push(json!(field));
            }
        }
    }
    for field in fields {
        schema["properties"][*field]
            .as_object_mut()
            .expect("generated property")
            .remove("nullable");
    }
}

fn operation(
    method: &str,
    parameters: Vec<Value>,
    success: &str,
    errors: &[(&str, ErrorResponseKind)],
) -> Value {
    let mut value = Map::new();
    value.insert("operationId".into(), Value::String(method.into()));
    if !parameters.is_empty() {
        value.insert("parameters".into(), Value::Array(parameters));
    }
    let mut responses = Map::new();
    responses.insert("200".into(), response(success));
    for (status, kind) in errors {
        let entry = responses
            .entry(*status)
            .or_insert_with(|| json!({"description":"API error","content":{}}));
        let (media_type, schema) = error_content(*kind);
        entry["content"][media_type] = json!({"schema":schema});
    }
    value.insert("responses".into(), Value::Object(responses));
    Value::Object(value)
}

pub fn document() -> Value {
    let mut schemas = BTreeMap::new();
    add_schema(
        &mut schemas,
        "HealthResponse",
        generated::<HealthResponse>(),
    );
    add_schema(
        &mut schemas,
        "SymbolsResponse",
        generated::<SymbolsResponse>(),
    );
    add_schema(
        &mut schemas,
        "RuntimeModeResponse",
        generated::<RuntimeModeResponse>(),
    );
    add_schema(
        &mut schemas,
        "RuntimeModeSwitchRequest",
        generated::<RuntimeModeSwitchRequest>(),
    );
    add_schema(
        &mut schemas,
        "PipelineHealthResponse",
        generated::<PipelineHealthResponse>(),
    );
    let (mut anomaly_schema, anomaly_definitions) = generated::<AnomalyResponse>();
    anomaly_schema["properties"]["id"]["format"] = json!("uuid");
    schemas.insert("AnomalyResponse".into(), anomaly_schema);
    for (definition_name, definition) in anomaly_definitions {
        schemas.entry(definition_name).or_insert(definition);
    }
    add_schema(
        &mut schemas,
        "AnomaliesResponse",
        generated::<AnomaliesResponse>(),
    );
    add_schema(
        &mut schemas,
        "DashboardStateSummary",
        generated::<DashboardStateSummary>(),
    );
    add_schema(
        &mut schemas,
        "DashboardHealthSummary",
        generated::<DashboardHealthSummary>(),
    );
    add_schema(
        &mut schemas,
        "DashboardSymbolSummary",
        generated::<DashboardSymbolSummary>(),
    );
    add_schema(
        &mut schemas,
        "DashboardSummaryResponse",
        generated::<DashboardSummaryResponse>(),
    );
    add_schema(
        &mut schemas,
        "MarketStateResponse",
        generated::<MarketStateResponse>(),
    );
    add_schema(
        &mut schemas,
        "MarketHealthResponse",
        generated::<MarketHealthResponse>(),
    );
    add_schema(
        &mut schemas,
        "MarketTimelinePointResponse",
        generated::<MarketTimelinePointResponse>(),
    );
    add_schema(
        &mut schemas,
        "MarketTimelineResponse",
        generated::<MarketTimelineResponse>(),
    );
    for (schema_name, fields) in [
        ("DashboardSummaryResponse", &["source"][..]),
        ("DashboardSymbolSummary", &["source", "availability"][..]),
        ("MarketStateResponse", &["source", "availability"][..]),
        ("MarketHealthResponse", &["source", "availability"][..]),
        ("MarketTimelineResponse", &["source"][..]),
        ("AnomaliesResponse", &["source"][..]),
        ("SymbolsResponse", &["source"][..]),
    ] {
        required_non_nullable(&mut schemas, schema_name, fields);
    }
    required_nullable(
        &mut schemas,
        "RuntimeModeResponse",
        &["last_switched_at", "last_error"],
    );
    required_nullable(
        &mut schemas,
        "PipelineHealthResponse",
        &["last_message_age_ms"],
    );
    required_nullable(
        &mut schemas,
        "MarketStateResponse",
        &[
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
            "last_depth_event_time",
            "last_depth_ingest_time",
            "spread_pct",
            "price_change_1m_pct",
            "trades_per_minute",
            "last_event_time",
            "last_ingest_time",
            "last_event_age_ms",
        ],
    );
    required_nullable(
        &mut schemas,
        "AnomalyResponse",
        &["observed_value", "threshold_value"],
    );
    required_nullable(
        &mut schemas,
        "DashboardStateSummary",
        &[
            "last_trade_price",
            "best_bid_price",
            "best_ask_price",
            "spread_pct",
            "price_change_1m_pct",
            "trades_per_minute",
            "last_event_time",
            "last_event_age_ms",
        ],
    );
    required_nullable(
        &mut schemas,
        "MarketTimelinePointResponse",
        &["spread_pct", "trades_per_minute", "last_event_age_ms"],
    );
    {
        let summary = schemas
            .get_mut("DashboardSymbolSummary")
            .expect("summary schema exists");
        summary["properties"]["state"] =
            json!({"allOf":[ref_schema("DashboardStateSummary")],"nullable":true});
        summary["properties"]["health"] =
            json!({"allOf":[ref_schema("DashboardHealthSummary")],"nullable":true});
        summary["required"] = json!(["availability", "health", "source", "state", "symbol"]);
    }
    let mut error = Map::new();
    error.insert("type".into(), json!("object"));
    error.insert("additionalProperties".into(), json!(false));
    error.insert("properties".into(), json!({"error":{"type":"string","enum":["invalid_symbol","invalid_request","forbidden","conflict","not_found","cache_unavailable","internal_error"]},"message":{"type":"string"}}));
    error.insert("required".into(), json!(["error", "message"]));
    schemas.insert("ApiErrorResponse".into(), Value::Object(error));
    schemas.insert("ExtractorRejectionBody".into(), json!({"type":"string"}));

    let mode = query("mode", json!({"type":"string","enum":["demo","live"]}));
    let mut paths = Map::new();
    paths.insert(
        HEALTH.into(),
        json!({"get":operation("getHealth", vec![], "HealthResponse", &[])}),
    );
    paths.insert(RUNTIME_MODE.into(), json!({"get":operation("getRuntimeMode", vec![], "RuntimeModeResponse", &[]),"post":{"operationId":"postRuntimeMode","requestBody":{"required":true,"content":{"application/json":{"schema":ref_schema("RuntimeModeSwitchRequest")}}},"responses":{"200":response("RuntimeModeResponse"),"400":{"description":"API error","content":{"application/json":{"schema":ref_schema("ApiErrorResponse")},"text/plain; charset=utf-8":{"schema":ref_schema("ExtractorRejectionBody")}}},"403":error_response(ErrorResponseKind::HandlerJson),"409":error_response(ErrorResponseKind::HandlerJson),"415":error_response(ErrorResponseKind::ExtractorText),"422":error_response(ErrorResponseKind::ExtractorText),"500":error_response(ErrorResponseKind::HandlerJson)}}}));
    paths.insert(
        PIPELINE_HEALTH.into(),
        json!({"get":operation("getPipelineHealth", vec![], "PipelineHealthResponse", &[])}),
    );
    paths.insert(DASHBOARD_SUMMARY.into(), json!({"get":operation("getDashboardSummary", vec![mode.clone()], "DashboardSummaryResponse", &[("400", ErrorResponseKind::ExtractorText), ("500", ErrorResponseKind::HandlerJson), ("503", ErrorResponseKind::HandlerJson)])}));
    paths.insert(SYMBOLS.into(), json!({"get":operation("getSymbols", vec![], "SymbolsResponse", &[("500", ErrorResponseKind::HandlerJson), ("503", ErrorResponseKind::HandlerJson)])}));
    paths.insert(MARKET_STATE.into(), json!({"get":operation("getMarketState", vec![path_param()], "MarketStateResponse", &[("400", ErrorResponseKind::HandlerJson), ("404", ErrorResponseKind::HandlerJson), ("503", ErrorResponseKind::HandlerJson)])}));
    paths.insert(MARKET_HEALTH.into(), json!({"get":operation("getMarketHealth", vec![path_param()], "MarketHealthResponse", &[("400", ErrorResponseKind::HandlerJson), ("404", ErrorResponseKind::HandlerJson), ("500", ErrorResponseKind::HandlerJson), ("503", ErrorResponseKind::HandlerJson)])}));
    paths.insert(MARKET_TIMELINE.into(), json!({"get":operation("getMarketTimeline", vec![path_param(), mode], "MarketTimelineResponse", &[("400", ErrorResponseKind::ExtractorText), ("400", ErrorResponseKind::HandlerJson), ("500", ErrorResponseKind::HandlerJson)])}));
    paths.insert(ANOMALIES.into(), json!({"get":operation("getAnomalies", vec![query("symbol", json!({"type":"string","pattern":"^[A-Za-z0-9]+$"})), query("limit", json!({"type":"string","pattern":"^[0-9]+$"}))], "AnomaliesResponse", &[("400", ErrorResponseKind::HandlerJson), ("500", ErrorResponseKind::HandlerJson)])}));
    let mut document = json!({"openapi":"3.0.3","info":{"title":"SignalGuard web console API","version":"0.4.0"},"paths":paths,"components":{"schemas":schemas},"x-signalguard-metrics":{"path":METRICS,"method":"GET","contentType":"text/plain; version=0.0.4; charset=utf-8","description":"Prometheus text endpoint; excluded from JSON schemas."}});
    sort_object_keys(&mut document);
    document
}

fn sort_object_keys(value: &mut Value) {
    if let Value::Object(object) = value {
        let mut sorted = Map::new();
        for (key, mut value) in std::mem::take(object) {
            sort_object_keys(&mut value);
            sorted.insert(key, value);
        }
        *object = sorted;
    } else if let Value::Array(array) = value {
        array.iter_mut().for_each(sort_object_keys);
    }
}

pub fn render() -> Vec<u8> {
    let mut bytes = serde_json::to_vec_pretty(&document()).expect("contract JSON is serializable");
    bytes.push(b'\n');
    bytes
}

pub fn artifact_matches(bytes: &[u8]) -> bool {
    bytes == render()
}

pub fn validate_openapi(bytes: &[u8]) -> Result<(), String> {
    serde_json::from_slice::<openapiv3::OpenAPI>(bytes)
        .map(|_| ())
        .map_err(|error| format!("OpenAPI 3.0.3 validation failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generation_is_deterministic() {
        assert_eq!(render(), render());
    }

    #[test]
    fn checked_artifact_bytes_equal_generated_bytes() {
        let artifact = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/contracts/web-console.openapi.json"
        ));
        assert!(artifact_matches(artifact));
    }

    #[test]
    fn checked_artifact_is_valid_openapi_3_0_3() {
        let artifact = include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/contracts/web-console.openapi.json"
        ));
        validate_openapi(artifact).unwrap();
    }

    #[test]
    fn intentional_artifact_drift_fails_the_check() {
        let mut stale = render();
        stale[0] = b' ';
        assert!(!artifact_matches(&stale));
    }

    #[test]
    fn generated_route_method_inventory_is_complete() {
        let document = document();
        let paths = document["paths"].as_object().unwrap();
        let expected = [
            ANOMALIES,
            DASHBOARD_SUMMARY,
            HEALTH,
            MARKET_HEALTH,
            MARKET_STATE,
            MARKET_TIMELINE,
            PIPELINE_HEALTH,
            RUNTIME_MODE,
            SYMBOLS,
        ];
        assert_eq!(
            paths.keys().map(String::as_str).collect::<Vec<_>>(),
            expected.to_vec()
        );
        assert_eq!(
            paths[HEALTH]
                .as_object()
                .unwrap()
                .keys()
                .collect::<Vec<_>>(),
            &[&String::from("get")]
        );
        assert!(
            paths[RUNTIME_MODE].get("get").is_some() && paths[RUNTIME_MODE].get("post").is_some()
        );
        for path in [
            PIPELINE_HEALTH,
            DASHBOARD_SUMMARY,
            SYMBOLS,
            MARKET_STATE,
            MARKET_HEALTH,
            MARKET_TIMELINE,
            ANOMALIES,
        ] {
            assert!(paths[path].get("get").is_some());
        }
        assert_eq!(
            paths[MARKET_STATE]["get"]["parameters"][0]["name"],
            "symbol"
        );
        assert_eq!(
            paths[DASHBOARD_SUMMARY]["get"]["parameters"][0]["name"],
            "mode"
        );
        assert_eq!(
            paths[MARKET_TIMELINE]["get"]["parameters"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| p["name"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["symbol", "mode"]
        );
        assert_eq!(
            paths[ANOMALIES]["get"]["parameters"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| p["name"].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["symbol", "limit"]
        );
        assert_eq!(
            document["x-signalguard-metrics"]["contentType"],
            "text/plain; version=0.0.4; charset=utf-8"
        );
    }

    #[test]
    fn generated_schema_covers_serialization_and_null_semantics() {
        let schemas = &document()["components"]["schemas"];
        assert_eq!(
            schemas["MarketStateResponse"]["properties"]["last_trade_price"]["type"],
            "string"
        );
        assert_eq!(
            schemas["AnomalyResponse"]["properties"]["id"]["type"],
            "string"
        );
        assert_eq!(
            schemas["AnomalyResponse"]["properties"]["id"]["format"],
            "uuid"
        );
        assert_eq!(
            schemas["ContractSeverity"]["enum"],
            json!(["info", "warning", "critical"])
        );
        assert_eq!(
            schemas["AnomalyResponse"]["properties"]["event_time"]["format"],
            "date-time"
        );
        assert!(schemas["DashboardSummaryResponse"]["properties"]["symbols"]["type"] == "array");
        for (schema_name, fields) in [
            ("DashboardSummaryResponse", &["source"][..]),
            ("DashboardSymbolSummary", &["source", "availability"][..]),
            ("MarketStateResponse", &["source", "availability"][..]),
            ("MarketHealthResponse", &["source", "availability"][..]),
            ("MarketTimelineResponse", &["source"][..]),
            ("AnomaliesResponse", &["source"][..]),
            ("SymbolsResponse", &["source"][..]),
        ] {
            let required = schemas[schema_name]["required"].as_array().unwrap();
            for field in fields {
                assert!(required.iter().any(|value| value == field));
                assert_ne!(
                    schemas[schema_name]["properties"][*field].get("nullable"),
                    Some(&json!(true))
                );
            }
        }
        assert_eq!(
            schemas["MarketAvailability"]["enum"],
            json!(["observed", "configured", "awaiting", "unavailable"])
        );
        assert_eq!(schemas["PublicDataMode"]["enum"], json!(["demo", "live"]));
        assert_eq!(
            schemas["DashboardSymbolSummary"]["properties"]["state"]["allOf"][0]["$ref"],
            "#/components/schemas/DashboardStateSummary"
        );
        assert_eq!(
            schemas["DashboardSymbolSummary"]["properties"]["state"]["nullable"],
            true
        );
        assert_eq!(
            schemas["DashboardSymbolSummary"]["properties"]["health"]["allOf"][0]["$ref"],
            "#/components/schemas/DashboardHealthSummary"
        );
        assert_eq!(
            schemas["DashboardSymbolSummary"]["properties"]["health"]["nullable"],
            true
        );
        assert!(
            schemas["DashboardStateSummary"]["required"]
                .as_array()
                .unwrap()
                .iter()
                .any(|field| field == "last_trade_price")
        );
        assert!(
            !schemas["RuntimeModeSwitchRequest"]["required"]
                .as_array()
                .unwrap()
                .iter()
                .any(|v| v == "symbols")
        );
        assert_eq!(
            schemas["RuntimeModeSwitchRequest"]["properties"]["symbols"]["nullable"],
            true
        );
        assert_eq!(
            schemas["ApiErrorResponse"]["required"],
            json!(["error", "message"])
        );
    }

    #[test]
    fn error_status_inventory_is_reachable_and_existing() {
        let document = document();
        let responses = |path: &str, method: &str| {
            document["paths"][path][method]["responses"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>()
        };
        assert_eq!(
            responses(RUNTIME_MODE, "post"),
            vec!["200", "400", "403", "409", "415", "422", "500"]
        );
        assert_eq!(
            responses(MARKET_STATE, "get"),
            vec!["200", "400", "404", "503"]
        );
        for path in [
            DASHBOARD_SUMMARY,
            SYMBOLS,
            MARKET_HEALTH,
            MARKET_TIMELINE,
            ANOMALIES,
        ] {
            assert!(
                responses(path, "get").contains(&"500".into())
                    || responses(path, "get").contains(&"503".into())
            );
        }
    }

    #[test]
    fn error_media_types_match_router_probe_matrix() {
        let document = document();
        let content = |path: &str, method: &str, status: &str| {
            document["paths"][path][method]["responses"][status]["content"]
                .as_object()
                .unwrap()
                .keys()
                .cloned()
                .collect::<Vec<_>>()
        };
        assert_eq!(
            content(DASHBOARD_SUMMARY, "get", "400"),
            vec!["text/plain; charset=utf-8"]
        );
        assert_eq!(
            content(MARKET_TIMELINE, "get", "400"),
            vec!["application/json", "text/plain; charset=utf-8"]
        );
        assert_eq!(
            content(RUNTIME_MODE, "post", "400"),
            vec!["application/json", "text/plain; charset=utf-8"]
        );
        assert_eq!(
            content(RUNTIME_MODE, "post", "415"),
            vec!["text/plain; charset=utf-8"]
        );
        assert_eq!(
            content(RUNTIME_MODE, "post", "422"),
            vec!["text/plain; charset=utf-8"]
        );
        assert_eq!(
            content(MARKET_STATE, "get", "400"),
            vec!["application/json"]
        );
        assert_eq!(
            document["components"]["schemas"]["ExtractorRejectionBody"]["type"],
            "string"
        );
    }
}

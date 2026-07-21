# API Examples

These examples are based on deterministic replay mode and the bundled fixtures in [`examples/replay/`](../examples/replay/).

The default fast-demo path uses `examples/replay/sample.jsonl`, which contains normalized trade and quote events for `BTCUSDT` and `ETHUSDT`. Replay fixtures use historical `event_time` values, so `stale_data` and `event_lag_spike` anomalies are expected in demo runs and `last_event_age_ms` will usually be large.

## Endpoints

- `GET /health`
- `GET /runtime/mode`
- `POST /runtime/mode`
- `GET /pipeline/health`
- `GET /dashboard/summary?mode=demo|live`
- `GET /metrics`
- `GET /symbols`
- `GET /market/{symbol}/state`
- `GET /market/{symbol}/timeline?mode=demo|live`
- `GET /market/{symbol}/health`
- `GET /anomalies`

## `GET /health`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/health
```

```json
{
  "status": "ok",
  "service": "signalguard-rs"
}
```

## `GET /pipeline/health`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/pipeline/health
```

```json
{
  "status": "healthy",
  "last_message_age_ms": 1234,
  "parse_errors": 0,
  "reconnect_attempts": 0,
  "storage_errors": 0,
  "cache_errors": 0
}
```

This endpoint reports ingestion and storage/cache counter health. It is separate from `GET /market/{symbol}/health`, which evaluates one symbol's latest market state and recent anomalies.

## `GET /dashboard/summary?mode=demo|live`

```bash
curl --fail --silent --show-error "http://127.0.0.1:8080/dashboard/summary?mode=demo"
```

This is the compact read-only dashboard bootstrap endpoint for the public web console. Missing `mode` defaults to `demo`.

- `mode=demo` returns deterministic read-only demo data from the in-memory demo source
- `mode=live` reads the existing storage/cache-backed live path and can be stale if backend ingestion is not active

It combines:

- service metadata
- pipeline counter health
- Redis-backed tracked symbols
- Redis-backed latest market state summaries when available
- per-symbol market health summaries derived from latest state plus recent anomalies
- PostgreSQL-backed recent anomalies

If a symbol is present in the tracked-symbol set but no latest market state is available, the symbol remains in the response while `state` and `health` are `null`.

Example `mode=demo` response:

```json
{
  "service": {
    "status": "ok",
    "service": "signalguard-rs"
  },
  "pipeline": {
    "status": "healthy",
    "last_message_age_ms": 1234,
    "parse_errors": 0,
    "reconnect_attempts": 0,
    "storage_errors": 0,
    "cache_errors": 0
  },
  "symbols": [
    {
      "symbol": "BTCUSDT",
      "state": {
        "last_trade_price": "65054.25",
        "best_bid_price": "65048.00",
        "best_ask_price": "65055.00",
        "spread_pct": 0.01076070497990054,
        "price_change_1m_pct": 0.08346153846153846,
        "trades_per_minute": 2.0,
        "last_event_time": "2026-01-01T00:00:03Z",
        "last_event_age_ms": 123456789,
        "depth_sequence_gap_count": 0
      },
      "health": {
        "score": 75,
        "status": "degraded",
        "recent_anomaly_count": 1,
        "evaluated_at": "<evaluated_at>"
      }
    }
  ],
  "recent_anomalies": [
    {
      "id": "<uuid>",
      "symbol": "BTCUSDT",
      "anomaly_type": "stale_data",
      "severity": "critical",
      "message": "market data age is 123456789 ms, exceeding the configured 5000 ms threshold",
      "observed_value": 123456789.0,
      "threshold_value": 5000.0,
      "event_time": "2026-01-01T00:00:00Z",
      "created_at": "<created_at>"
    }
  ]
}
```

This endpoint is read-only. It does not place trades, does not use private exchange APIs, and does not expose account, order, or balance data.

## `GET /symbols`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/symbols
```

```json
{
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```

## `GET /market/BTCUSDT/state`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/state
```

Trade/quote replay example from `examples/replay/sample.jsonl`:

```json
{
  "symbol": "BTCUSDT",
  "last_trade_price": "65054.25",
  "last_trade_quantity": "0.220",
  "best_bid_price": "65048.00",
  "best_bid_quantity": "0.95",
  "best_ask_price": "65055.00",
  "best_ask_quantity": "0.90",
  "top_bid_quantity": null,
  "top_ask_quantity": null,
  "top_bid_liquidity": null,
  "top_ask_liquidity": null,
  "book_imbalance": null,
  "depth_sequence_gap_count": 0,
  "last_depth_event_time": null,
  "last_depth_ingest_time": null,
  "spread_pct": 0.01076070497990054,
  "price_change_1m_pct": 0.08346153846153846,
  "trades_per_minute": 2.0,
  "last_event_time": "2026-01-01T00:00:03Z",
  "last_ingest_time": "<ingest_time>",
  "last_event_age_ms": 123456789
}
```

Depth-only replay example from `examples/replay/depth_gap_sample.jsonl`:

```json
{
  "symbol": "BTCUSDT",
  "last_trade_price": null,
  "last_trade_quantity": null,
  "best_bid_price": null,
  "best_bid_quantity": null,
  "best_ask_price": null,
  "best_ask_quantity": null,
  "top_bid_quantity": "0.95",
  "top_ask_quantity": "0.80",
  "top_bid_liquidity": "61795.6000",
  "top_ask_liquidity": "123605.0500",
  "book_imbalance": "-0.3333829758553290545953282284",
  "depth_sequence_gap_count": 1,
  "last_depth_event_time": "2026-01-01T00:00:05Z",
  "last_depth_ingest_time": "<ingest_time>",
  "spread_pct": null,
  "price_change_1m_pct": null,
  "trades_per_minute": null,
  "last_event_time": "2026-01-01T00:00:05Z",
  "last_ingest_time": "<ingest_time>",
  "last_event_age_ms": 123456789
}
```

`last_ingest_time` and `last_event_age_ms` vary by run. Depth fields are only populated when replaying normalized depth fixtures such as `depth_sample.jsonl` or `depth_gap_sample.jsonl`.

## `GET /anomalies?symbol=BTCUSDT&limit=50`

```bash
curl --fail --silent --show-error "http://127.0.0.1:8080/anomalies?symbol=BTCUSDT&limit=50"
```

The response shape is the same for all anomaly types. Implemented anomaly types in v0.4 are:

- `price_move`
- `spread_spike`
- `stale_data`
- `trade_burst`
- `quote_stuck`
- `event_lag_spike`
- `depth_sequence_gap`

Example replay response item:

```json
{
  "id": "<uuid>",
  "symbol": "BTCUSDT",
  "anomaly_type": "stale_data",
  "severity": "critical",
  "message": "market data age is 123456789 ms, exceeding the configured 5000 ms threshold",
  "observed_value": 123456789.0,
  "threshold_value": 5000.0,
  "event_time": "2026-01-01T00:00:00Z",
  "created_at": "<created_at>"
}
```

Depth replay can emit the same shape with `anomaly_type: "depth_sequence_gap"` when the local order book sees a gap in update IDs.

## `GET /market/BTCUSDT/health`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/health
```

```json
{
  "symbol": "BTCUSDT",
  "score": 75,
  "base_score": 100,
  "status": "degraded",
  "evaluated_at": "<evaluated_at>",
  "recent_anomaly_count": 1,
  "signals": {
    "spread_pct": 0.01076070497990054,
    "price_change_1m_pct": 0.08346153846153846,
    "trades_per_minute": 2.0,
    "last_event_time": "2026-01-01T00:00:03Z",
    "last_event_age_ms": 123456789
  },
  "penalties": [
    {
      "reason": "recent stale_data anomaly with critical severity",
      "penalty": 25,
      "anomaly_type": "stale_data",
      "severity": "critical",
      "observed_value": 123456789.0,
      "threshold_value": 5000.0,
      "event_time": "2026-01-01T00:00:00Z"
    }
  ]
}
```

The health score is penalty-based and explainable. Historical replay timestamps commonly drive this endpoint toward `degraded` or `unhealthy` unless the fixture timestamps are close to the current clock.

## `GET /metrics`

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/metrics
```

Compact Prometheus example:

```text
signalguard_events_processed_total{source="replay",event_type="trade"} 4
signalguard_events_processed_total{source="replay",event_type="quote"} 4
signalguard_events_processed_total{source="replay",event_type="depth"} 0
signalguard_events_processed_total{source="binance",event_type="trade"} 0
signalguard_events_processed_total{source="binance",event_type="quote"} 0
signalguard_events_processed_total{source="binance",event_type="depth"} 0
signalguard_parse_errors_total 0
signalguard_source_parse_errors_total{source="replay"} 0
signalguard_source_parse_errors_total{source="binance"} 0
signalguard_reconnect_attempts_total 0
signalguard_source_reconnect_attempts_total{source="binance"} 0
signalguard_storage_errors_total 0
signalguard_cache_errors_total 0
signalguard_last_message_age_ms 0
```

After replaying `examples/replay/depth_sample.jsonl` or `examples/replay/depth_gap_sample.jsonl`, the same metric family reports depth traffic, for example:

```text
signalguard_events_processed_total{source="replay",event_type="depth"} 2
```

## Runtime mode status and operator switch

`GET /runtime/mode` is always read-only. Its `switching_supported` field reflects the configured `SIGNALGUARD_ENABLE_RUNTIME_SWITCH` operator gate.

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/runtime/mode
```

With the default `SIGNALGUARD_ENABLE_RUNTIME_SWITCH=false`, `switching_supported` is `false` and every `POST /runtime/mode` request returns `403 Forbidden`, including requests that contain explicit reset flags.

When an operator-controlled environment explicitly enables switching, omission is non-destructive:

```bash
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8080/runtime/mode \
  --header 'content-type: application/json' \
  --data '{"mode":"live","symbols":["BTCUSDT","ETHUSDT"]}'
```

The request above resolves `reset_state=false` and `reset_storage=false`. Destructive operations require explicit `true`, and the flags remain independent:

```json
{"mode":"replay","reset_state":true}
```

```json
{"mode":"replay","reset_storage":true}
```

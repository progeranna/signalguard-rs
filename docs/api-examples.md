# API Examples

These examples are based on replay mode with the default fixture `examples/replay/sample.jsonl`.

Replay fixtures use historical `event_time` values. Because of that, `stale_data` anomalies and a `degraded` health score are expected unless the fixture timestamps are near the current clock.

## `GET /health`

Request:

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/health
```

Example response:

```json
{
  "status": "ok",
  "service": "signalguard-rs"
}
```

## `GET /symbols`

Request:

```bash
curl --silent --show-error http://127.0.0.1:8080/symbols
```

Example response:

```json
{
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```

## `GET /market/BTCUSDT/state`

Request:

```bash
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/state
```

Example response:

```json
{
  "symbol": "BTCUSDT",
  "last_trade_price": "65054.25",
  "last_trade_quantity": "0.220",
  "best_bid_price": "65048.00",
  "best_bid_quantity": "0.95",
  "best_ask_price": "65055.00",
  "best_ask_quantity": "0.90",
  "spread_pct": 0.01076070497990054,
  "price_change_1m_pct": 0.08346153846153846,
  "trades_per_minute": 2.0,
  "last_event_time": "2026-01-01T00:00:03Z",
  "last_ingest_time": "<ingest_time>",
  "last_event_age_ms": 13171731308
}
```

`last_ingest_time` and `last_event_age_ms` vary by run.

## `GET /anomalies?symbol=BTCUSDT&limit=50`

Request:

```bash
curl --silent --show-error "http://127.0.0.1:8080/anomalies?symbol=BTCUSDT&limit=50"
```

Example response:

```json
{
  "anomalies": [
    {
      "id": "<uuid>",
      "symbol": "BTCUSDT",
      "anomaly_type": "stale_data",
      "severity": "critical",
      "message": "market data age is 13171703130 ms, exceeding the configured 5000 ms threshold",
      "observed_value": 13171703130.0,
      "threshold_value": 5000.0,
      "event_time": "2026-01-01T00:00:00Z",
      "created_at": "<created_at>"
    }
  ]
}
```

`id` and `created_at` vary by run.

## `GET /market/BTCUSDT/health`

Request:

```bash
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/health
```

Example response:

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
    "last_event_age_ms": 13171732039
  },
  "penalties": [
    {
      "reason": "recent stale_data anomaly with critical severity",
      "penalty": 25,
      "anomaly_type": "stale_data",
      "severity": "critical",
      "observed_value": 13171703130.0,
      "threshold_value": 5000.0,
      "event_time": "2026-01-01T00:00:00Z"
    }
  ]
}
```

`evaluated_at` and `last_event_age_ms` vary by run.

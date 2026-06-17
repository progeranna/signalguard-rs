# Replay Fixture Format

Replay mode reads normalized JSON Lines files. Each non-empty line is one SignalGuard event routed through the same ingestion pipeline used by live mode.

Replay fixtures are not raw Binance payloads. They already use SignalGuard's normalized schema.

## Shared fields

Every replay line includes:

- `type`: `trade`, `quote`, or `depth`
- `symbol`: uppercase market symbol such as `BTCUSDT`
- `exchange`: normalized source name such as `binance`
- `event_time`: RFC3339 timestamp

## Trade format

Required fields:

- `type = "trade"`
- `symbol`
- `exchange`
- `event_time`
- `price`
- `quantity`

Optional field:

- `trade_id`

Example:

```json
{"type":"trade","symbol":"BTCUSDT","exchange":"binance","trade_id":1001,"price":"65000.00","quantity":"0.015","event_time":"2026-01-01T00:00:01Z"}
```

## Quote format

Required fields:

- `type = "quote"`
- `symbol`
- `exchange`
- `event_time`
- `best_bid_price`
- `best_bid_quantity`
- `best_ask_price`
- `best_ask_quantity`

Example:

```json
{"type":"quote","symbol":"BTCUSDT","exchange":"binance","best_bid_price":"65048.00","best_bid_quantity":"0.95","best_ask_price":"65055.00","best_ask_quantity":"0.90","event_time":"2026-01-01T00:00:02Z"}
```

## Depth format

Required fields:

- `type = "depth"`
- `symbol`
- `exchange`
- `event_time`
- `bids`
- `asks`

Optional fields:

- `first_update_id`
- `final_update_id`

Depth levels are `[price, quantity]` string pairs. A zero quantity means the level should be removed from the local top-N order book when the update is applied.

Example:

```json
{"type":"depth","symbol":"BTCUSDT","exchange":"binance","event_time":"2026-01-01T00:00:04Z","first_update_id":100,"final_update_id":101,"bids":[["65048.00","1.20"],["65047.50","0"]],"asks":[["65055.00","0.80"]]}
```

Depth replay updates latest runtime state and depth-derived fields such as top-of-book quantities, liquidity proxies, imbalance, and depth sequence gap counts. It does not add REST snapshot bootstrap, full Binance resync, or full historical order-book persistence.

## Historical timestamps

The bundled fixtures intentionally use historical `event_time` values for deterministic demos and tests.

Expected effects:

- `last_event_age_ms` will usually be large.
- `stale_data` anomalies may appear in replay mode.
- `event_lag_spike` anomalies may appear in replay mode.
- symbol-level health can be `degraded` or `unhealthy` even when the service itself is working correctly.

This behavior is expected for replay demos and does not mean the parser or API is broken.

## Fixture files

- `examples/replay/sample.jsonl`
  Trade and quote replay for `BTCUSDT` and `ETHUSDT`. Used by the fast local demo path.
- `examples/replay/depth_sample.jsonl`
  Depth replay for local top-N order-book state without an intentional sequence gap.
- `examples/replay/depth_gap_sample.jsonl`
  Depth replay with a deliberate update-ID gap. Used by the ignored replay E2E path to verify `depth_sequence_gap_count` and `depth_sequence_gap`.

See [`examples/replay/README.md`](../examples/replay/README.md) for a compact fixture index.

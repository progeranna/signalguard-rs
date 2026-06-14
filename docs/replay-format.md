# Replay Fixture Format

Replay fixtures use JSON Lines. Each non-empty line is one normalized event.

Shared fields:

- `type`: `trade` or `quote`
- `symbol`: uppercase market symbol such as `BTCUSDT`
- `exchange`: normalized exchange name such as `binance`
- `event_time`: RFC3339 timestamp

Trade fields:

- `trade_id`: optional unsigned integer
- `price`: decimal string
- `quantity`: decimal string

Quote fields:

- `best_bid_price`: decimal string
- `best_bid_quantity`: decimal string
- `best_ask_price`: decimal string
- `best_ask_quantity`: decimal string

Example trade:

```json
{"type":"trade","symbol":"BTCUSDT","exchange":"binance","trade_id":1,"price":"65000.00","quantity":"0.010","event_time":"2026-01-01T00:00:00Z"}
```

Example quote:

```json
{"type":"quote","symbol":"BTCUSDT","exchange":"binance","best_bid_price":"64999.00","best_bid_quantity":"1.20","best_ask_price":"65001.00","best_ask_quantity":"1.10","event_time":"2026-01-01T00:00:01Z"}
```

# signalguard-rs

`signalguard-rs` is a Rust backend service for crypto market data integrity monitoring. It ingests public Binance market data and deterministic local replay fixtures, normalizes trade and quote events, computes per-symbol market state, detects rule-based anomalies, stores historical events in PostgreSQL, caches latest state snapshots in Redis, and exposes an Axum REST API.

The project is intentionally scoped as a production-minded MVP backend. It is not a trading bot, not a prediction system, and not a market manipulation detector.


## What SignalGuard does

SignalGuard turns normalized market events into an explainable market health API.

- `replay` mode reads local JSONL fixtures and is the deterministic default demo path.
- `live` mode connects to Binance public WebSocket streams for configured symbols.
- Both modes feed the same `NormalizedEvent` pipeline.
- PostgreSQL stores historical trades, quotes, and anomaly events.
- Redis stores only the latest market state snapshot per symbol.
- In-memory state maintains sliding windows and the trade-burst warmup baseline.
- The API exposes latest state, recent anomalies, and a heuristic market health score.

## Features

- Axum HTTP API with `GET /health`, `GET /symbols`, `GET /market/{symbol}/state`, `GET /anomalies`, and `GET /market/{symbol}/health`
- Deterministic replay mode that does not require network access
- Binance public WebSocket ingestion for trades and `bookTicker`
- Shared normalization path for replay and live ingestion
- Rule-based anomaly detectors:
  - `price_move`
  - `spread_spike`
  - `stale_data`
  - `trade_burst`
- Explainable, penalty-based health score
- PostgreSQL historical storage and Redis latest-state cache
- In-process operational counters for parse errors, reconnect attempts, storage/cache errors, and last processed normalized message time

## Architecture

SignalGuard is a single-crate Rust service with explicit ownership boundaries:

- PostgreSQL is historical truth.
- Redis is a latest-state cache only.
- Sliding windows and trade-burst baseline live in memory.
- Replay and live ingestion converge before storage, state aggregation, and detection.

See [docs/architecture.md](docs/architecture.md) for the full text diagram.

## Quickstart

Prerequisites:

- Rust toolchain
- Docker with Compose support
- `sqlx-cli`

Start local dependencies:

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
cargo run
```

The default configuration runs in replay mode with `examples/replay/sample.jsonl`. The server binds to `127.0.0.1:8080`.

Stop local dependencies:

```bash
docker compose down
```

## Demo modes: replay and live

### Replay

Replay mode is the deterministic default demo path. It does not need external network access and routes fixture events through the same normalization, storage, cache, aggregation, and detector path as live mode.

For deterministic demo output, replay startup clears the PostgreSQL `trades`, `quotes`, and `anomalies` tables before ingesting the fixture by default.

Set `SIGNALGUARD_REPLAY_RESET_STORAGE=false` if you want replay mode to preserve existing PostgreSQL history instead. Live mode never clears historical tables automatically.

Default fixture:

```bash
examples/replay/sample.jsonl
```

Override the fixture path:

```bash
SIGNALGUARD_INGESTION_REPLAY_PATH=examples/replay/btcusdt_anomalies.jsonl cargo run
```

Preserve existing PostgreSQL history during replay:

```bash
SIGNALGUARD_REPLAY_RESET_STORAGE=false cargo run
```

Copy-paste replay demo:

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
cargo run
curl --fail --silent --show-error http://127.0.0.1:8080/health
curl --silent --show-error http://127.0.0.1:8080/symbols
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/state
curl --silent --show-error "http://127.0.0.1:8080/anomalies?symbol=BTCUSDT&limit=50"
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/health
docker compose down
```

### Live

Live mode still requires PostgreSQL and Redis locally, but it reads market data from Binance public WebSocket streams only.

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
SIGNALGUARD_INGESTION_MODE=live SIGNALGUARD_INGESTION_SYMBOLS=BTCUSDT cargo run
```

Notes:

- no API keys are required
- no order execution or trading behavior exists
- stop the service with `Ctrl+C`
- live reliability depends on Binance public WebSocket availability and local network access
- if you want live anomalies and health output without replay history, start from a fresh PostgreSQL database or clear the replay data first

## API examples

Replay-mode examples are documented in [docs/api-examples.md](docs/api-examples.md). They reflect the current response shapes for:

- `GET /health`
- `GET /symbols`
- `GET /market/BTCUSDT/state`
- `GET /anomalies?symbol=BTCUSDT&limit=50`
- `GET /market/BTCUSDT/health`

Replay fixtures use historical `event_time` values, so `stale_data` anomalies and `degraded` health are expected in those examples.

## Design decisions

- Single-crate modular architecture instead of a workspace for the MVP
- `rust_decimal::Decimal` for price and quantity in domain models, with `f64` used pragmatically for percentage calculations
- Replay and live ingestion share the same normalized event path
- PostgreSQL stores historical trades, quotes, and anomalies
- Redis stores only latest market state snapshots per symbol
- Sliding windows and trade-burst baseline remain in-memory for MVP simplicity
- Health score is heuristic, deterministic, explainable, configurable, and not trading advice
- Internal counters are in-process only; they are not exposed via Prometheus or an HTTP endpoint
- The recorded “last message” counter is the timestamp of the last processed normalized message, not exchange event time

## Failure modes

Failure-mode behavior is documented in [docs/failure-modes.md](docs/failure-modes.md).

Important cases:

- PostgreSQL unavailable at startup is fatal
- Redis unavailable at startup causes degraded service behavior
- replay startup clears historical demo tables by default so repeated replay runs stay deterministic
- set `SIGNALGUARD_REPLAY_RESET_STORAGE=false` to preserve PostgreSQL history during replay
- replay fixture parse failures are fatal by design
- live malformed Binance payloads are logged and skipped
- live WebSocket failures retry with bounded exponential backoff

## Limitations

- Redis is a latest-state cache, not historical truth
- PostgreSQL stores historical trades, quotes, and anomalies only
- Sliding windows and trade-burst baseline are in-memory and lost on restart
- No retention, partitioning, or downsampling is implemented
- No Prometheus `/metrics` endpoint exists
- Internal counters are not queryable through the API
- No order book depth support exists
- No real liquidity gap detection exists
- Health score is heuristic and not trading advice
- Replay historical timestamps can trigger `stale_data` anomalies and degraded health
- Live mode depends on Binance public WebSocket availability

## Roadmap

- Prometheus `/metrics` and externalized metrics scraping
- PostgreSQL retention, partitioning, or downsampling strategy
- Order book depth ingestion
- Top-of-book liquidity signal and later depth-based liquidity analysis
- Additional detectors such as `parse_error_burst`, `quote_stuck`, and `event_lag_spike`
- Better health diagnostics and pipeline-level visibility
- Optional Docker-backed integration tests beyond the current unit-test-heavy MVP

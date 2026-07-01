# SignalGuard RS

SignalGuard RS is a Rust backend service for monitoring crypto market data quality. It combines deterministic replay, Binance public WebSocket ingestion, rule-based anomaly detection, PostgreSQL, Redis, Axum, and Tokio into a compact market-data infrastructure service that answers a practical question: how fresh, consistent, and observable is this stream right now?

## What It Does

- Replays deterministic JSONL fixtures for a local demo path
- Ingests live Binance public `trade`, `bookTicker`, and diff-depth streams
- Routes replay and live events through the same normalized pipeline
- Uses a bounded Tokio MPSC channel, so ingestion backpressures instead of silently dropping events
- Aggregates per-symbol market state in memory
- Maintains a simplified local top-N order book and depth-derived state fields
- Stores historical trades, quotes, and anomalies in PostgreSQL
- Stores latest market state snapshots in Redis
- Emits deterministic, rule-based anomalies such as `price_move`, `spread_spike`, `stale_data`, `trade_burst`, `quote_stuck`, `event_lag_spike`, and `depth_sequence_gap`
- Exposes market state, recent anomalies, market health, pipeline health, and Prometheus-compatible metrics over HTTP

## Fast Demo

Primary demo path:

```bash
bash scripts/demo-replay.sh
```

Prerequisites:

- Rust toolchain
- Docker daemon with Compose support
- `sqlx-cli`
- `curl`

The demo uses deterministic replay, does not require Binance network access, and does not require API keys. It starts PostgreSQL and Redis, runs migrations, starts the service in replay mode, and runs smoke checks against health, state, anomalies, and metrics.

To stop PostgreSQL and Redis automatically at the end:

```bash
DEMO_DOWN=1 bash scripts/demo-replay.sh
```

## Optional Docker App Profile

The primary fast demo remains `bash scripts/demo-replay.sh`. There is also an optional local app-container path:

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
docker compose --profile app up --build app
```

Migrations stay explicit. The `app` profile is a local runtime helper, not a production deployment path. After the container is up:

```bash
bash scripts/smoke.sh
docker compose --profile app down
```

## Web Console Local Development

The web console lives under [`web/`](web/) and runs separately from the Rust service during local development.

Start the backend first. The deterministic replay path is the fastest way to get demo data:

```bash
bash scripts/demo-replay.sh
```

Then start the frontend in a second terminal:

```bash
cd web
npm install
npm run dev
```

The frontend defaults `VITE_SIGNALGUARD_API_BASE_URL` to `/api`. The Vite dev server proxies `/api/*` to the local Axum service on `http://127.0.0.1:8080`, so the default local path does not require extra configuration.

If you want to point the frontend at a different backend origin during local development, override the base URL explicitly:

```bash
cd web
VITE_SIGNALGUARD_API_BASE_URL=http://127.0.0.1:8080 npm run dev
```

The frontend uses existing read-only backend endpoints only, with `GET /dashboard/summary` as the primary dashboard bootstrap contract.

## Configuration Profiles

The default runtime profile is `local`. Local mode is still explicit about service URLs: `SIGNALGUARD_DATABASE_URL` and `SIGNALGUARD_REDIS_URL` must come from `.env`, `.env.example`, Docker Compose, or `scripts/demo-replay.sh`; the Rust code does not embed PostgreSQL or Redis URL fallbacks.

Set `SIGNALGUARD_PROFILE=production` for production-style configuration boundaries. In that profile, the same storage and cache URLs must be provided explicitly and the service will not fall back to local demo credentials. This is configuration hygiene for a portfolio backend, not a production deployment guarantee.

## API Preview

Endpoints:

- `GET /health`
- `GET /pipeline/health`
- `GET /dashboard/summary`
- `GET /metrics`
- `GET /symbols`
- `GET /market/{symbol}/state`
- `GET /anomalies`
- `GET /market/{symbol}/health`

Compact `GET /market/BTCUSDT/state` example:

```json
{
  "symbol": "BTCUSDT",
  "last_trade_price": "65054.25",
  "best_bid_price": "65048.00",
  "best_ask_price": "65055.00",
  "spread_pct": 0.01076070497990054,
  "price_change_1m_pct": 0.08346153846153846,
  "trades_per_minute": 2.0,
  "depth_sequence_gap_count": 0
}
```

Full endpoint examples live in [docs/api-examples.md](docs/api-examples.md).

`GET /dashboard/summary` is the compact read-only dashboard bootstrap endpoint for the future public web console. It combines service metadata, pipeline health, tracked symbols, compact per-symbol state and health summaries when available, and recent anomalies into one frontend-friendly response.

## Architecture

- Ingestion: replay fixtures and live Binance payloads are parsed once and normalized once
- Pipeline: replay and live sources feed the same bounded event path
- State: in-memory aggregation computes latest market state, rolling windows, and runtime depth-derived fields
- Storage/cache: PostgreSQL stores historical events and anomalies, while Redis stores latest-state snapshots
- Detectors: anomaly rules are deterministic, explainable, and configuration-driven
- API: Axum exposes service health, pipeline health, state, anomalies, and market health
- Dashboard bootstrap: `GET /dashboard/summary` provides a compact read-only summary for the dashboard view

Deeper architecture notes: [docs/architecture.md](docs/architecture.md)

## Tech Stack

- Rust
- Tokio
- Axum
- SQLx
- PostgreSQL
- Redis
- Docker Compose
- Binance public WebSocket streams
- `serde`
- `tracing`

## Testing And Quality Gates

Core checks:

- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`

Normal `cargo test` does not require Docker, PostgreSQL, Redis, or Binance network access. Optional Docker-backed integration and replay E2E tests remain opt-in and are documented in [docs/operations.md](docs/operations.md).

## Design Decisions

- PostgreSQL is the historical truth for trades, quotes, and anomalies
- Redis is a latest-state cache only
- Replay and live ingestion share the same normalized pipeline
- Detectors are deterministic and rule-based
- Depth and order-book state are runtime latest-state signals, not full historical order-book persistence
- Market health is explainable and penalty-based rather than opaque scoring

## Limitations

- It does not place trades or manage accounts
- It does not submit, cancel, or route exchange orders
- It uses public Binance market-data WebSocket streams only
- It does not expose account balances, orders, or private exchange API access
- It does not forecast future prices
- It does not prove intent or market abuse
- The local Binance order-book view is simplified and lacks snapshot bootstrap/resync
- There is no REST snapshot bootstrap or full resync yet
- There is no historical full order-book persistence
- Replay timestamps are intentionally historical and can trigger `stale_data` and `event_lag_spike` anomalies

## Roadmap

- REST snapshot bootstrap and local order-book resync
- Retention and downsampling for historical storage
- A second exchange integration
- An optional dashboard or visual demo layer

## Engineering Highlights

- Shared replay/live pipeline keeps demo and runtime logic aligned
- Bounded backpressure makes ingestion behavior explicit under load
- PostgreSQL and Redis have clear, separate ownership boundaries
- Detectors are deterministic and easy to test from fixtures
- Depth sequence gap handling is visible in latest state and anomaly output
- Health scoring is heuristic, explainable, and not trading advice
- The local demo path is reproducible in a few minutes without exchange connectivity

## Further Reading

- [docs/operations.md](docs/operations.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/api-examples.md](docs/api-examples.md)
- [docs/replay-format.md](docs/replay-format.md)
- [docs/failure-modes.md](docs/failure-modes.md)

## License

MIT License. See [LICENSE](LICENSE).

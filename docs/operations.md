# Operations Runbook

## Purpose

This is a local and development runbook for SignalGuard RS v0.4.

It is not a production deployment guide.

## Prerequisites

- Rust toolchain
- Docker Desktop or a working Docker daemon
- `sqlx-cli` for migrations
- `curl`
- Optional internet access for Binance live mode

## Environment variables

- `SIGNALGUARD_PROFILE`
  `local` or `production`. Defaults to `local` for the Docker Compose demo path. In both profiles, `SIGNALGUARD_DATABASE_URL` and `SIGNALGUARD_REDIS_URL` must be set explicitly by `.env`, Docker Compose, or a local script.
- `SIGNALGUARD_HOST`
  Default bind host for the HTTP server.
- `SIGNALGUARD_PORT`
  Default bind port for the HTTP server.
- `SIGNALGUARD_DATABASE_URL`
  PostgreSQL connection string used by the service at runtime.
- `DATABASE_URL`
  PostgreSQL connection string used by `sqlx migrate run` and PostgreSQL integration tests.
- `SIGNALGUARD_REDIS_URL`
  Redis connection string used by the service at runtime.
- `REDIS_URL`
  Redis connection string used by the optional Redis integration tests and replay E2E test.
- `SIGNALGUARD_INGESTION_MODE`
  `replay` or `live`.
- `SIGNALGUARD_INGESTION_SYMBOLS`
  Comma-separated symbol list for live mode.
- `SIGNALGUARD_INGESTION_REPLAY_PATH`
  Replay fixture path for replay mode.
- `SIGNALGUARD_REPLAY_RESET_STATE`
  `true` clears SignalGuard Redis latest-state keys before Replay startup; `false` preserves and validates them. Defaults to `true`. Live startup always preserves and validates Redis state regardless of this Replay-only setting.
- `SIGNALGUARD_REPLAY_RESET_STORAGE`
  `true` clears PostgreSQL replay history tables before replay; `false` preserves existing PostgreSQL history. This setting does not control Redis.
- `SIGNALGUARD_ENABLE_RUNTIME_SWITCH`
  `false` by default. Keeps `POST /runtime/mode` disabled unless an operator explicitly enables runtime switching in a local or otherwise operator-controlled environment.
- `SIGNALGUARD_EVENT_CHANNEL_CAPACITY`
  Capacity of the bounded ingestion-to-pipeline channel. Replay and live await when the channel is full.
- `SIGNALGUARD_BINANCE_WEBSOCKET_BASE_URL`
  Base WebSocket URL for Binance public streams.
- `SIGNALGUARD_BINANCE_RECONNECT_MIN_BACKOFF_MS`
  Minimum live reconnect backoff.
- `SIGNALGUARD_BINANCE_RECONNECT_MAX_BACKOFF_MS`
  Maximum live reconnect backoff.

See [`.env.example`](../.env.example) for the full local set.

## Configuration profiles

SignalGuard is local-first for this release. The default `local` profile keeps the replay demo small, but PostgreSQL and Redis URLs still come from explicit environment configuration such as `.env.example`, Docker Compose, or `scripts/demo-replay.sh`.

Use `SIGNALGUARD_PROFILE=production` when you want production-style configuration validation. In that profile, the service fails fast if `SIGNALGUARD_DATABASE_URL` or `SIGNALGUARD_REDIS_URL` is missing, rather than silently using local demo credentials. Local profile also fails fast when those URLs are missing and points users to `.env.example`, Docker Compose, or `scripts/demo-replay.sh`. This runbook is still not a production deployment guide.

## Fast scripted replay demo

The shortest deterministic demo path is:

```bash
bash scripts/demo-replay.sh
```

The script checks for `cargo`, `docker`, Docker Compose, `sqlx`, and `curl`; starts PostgreSQL and Redis; runs migrations; starts the service in replay mode; waits for `/health`; and runs `scripts/smoke.sh`.

It does not require Binance network access or API keys. By default it leaves PostgreSQL and Redis running for follow-up inspection. To stop dependencies at the end:

```bash
DEMO_DOWN=1 bash scripts/demo-replay.sh
```

Expected output is intentionally concise:

- `/health` returns `status: ok`.
- `/symbols` includes `BTCUSDT`.
- `/market/BTCUSDT/state` returns latest replay state from Redis.
- `/anomalies` returns replay-triggered data-quality anomalies from PostgreSQL.
- `/metrics` includes `signalguard_events_processed_total`.

If the service is already running, run only the smoke checks:

```bash
bash scripts/smoke.sh
```

Override the target server with `BASE_URL`, for example:

```bash
BASE_URL=http://127.0.0.1:8080 bash scripts/smoke.sh
```

## Replay mode runbook

Manual flow:

```bash
docker compose up -d postgres redis
export SIGNALGUARD_PROFILE=local
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
export REDIS_URL="redis://127.0.0.1:6379"
export SIGNALGUARD_DATABASE_URL="${DATABASE_URL}"
export SIGNALGUARD_REDIS_URL="${REDIS_URL}"
sqlx migrate run
cargo run
```

After `cargo run` starts the server, use a second terminal for smoke checks:

```bash
curl --fail --silent --show-error http://127.0.0.1:8080/health
curl --silent --show-error http://127.0.0.1:8080/metrics
curl --silent --show-error http://127.0.0.1:8080/pipeline/health
curl --silent --show-error http://127.0.0.1:8080/symbols
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/state
curl --silent --show-error "http://127.0.0.1:8080/anomalies?symbol=BTCUSDT&limit=50"
curl --silent --show-error http://127.0.0.1:8080/market/BTCUSDT/health
docker compose down
```

Notes:

- Replay is deterministic by default.
- `SIGNALGUARD_REPLAY_RESET_STATE=true` clears only SignalGuard Redis latest-state keys before Replay ingestion.
- `SIGNALGUARD_REPLAY_RESET_STORAGE=true` independently clears PostgreSQL `trades`, `quotes`, and `anomalies` before replay.
- Set either flag to `false` only when preserving that specific store is intentional.
- `POST /runtime/mode` is disabled by default. Set `SIGNALGUARD_ENABLE_RUNTIME_SWITCH=true` only in local or operator-controlled environments where runtime switching and optional reset behavior are intended.
- Replay fixtures use historical timestamps, so `stale_data` anomalies and degraded market-health results are expected unless the fixture timestamps are near the current clock.

## Optional local app container

Keep `bash scripts/demo-replay.sh` as the primary fast demo path. If you want to run the service itself inside Docker, apply migrations from the host first and then start the optional compose app profile:

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
docker compose --profile app up --build app
```

Notes:

- The `app` profile is a local runtime helper, not a production deployment path.
- It uses replay mode with `examples/replay/sample.jsonl` inside the image.
- It does not run migrations automatically.
- It binds the service to port `8080`, so `bash scripts/smoke.sh` works from another terminal.

Smoke and cleanup:

```bash
bash scripts/smoke.sh
docker compose --profile app down
```

## Live mode runbook

Copy-paste flow:

```bash
docker compose up -d postgres redis
export SIGNALGUARD_PROFILE=local
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
export REDIS_URL="redis://127.0.0.1:6379"
export SIGNALGUARD_DATABASE_URL="${DATABASE_URL}"
export SIGNALGUARD_REDIS_URL="${REDIS_URL}"
sqlx migrate run
SIGNALGUARD_INGESTION_MODE=live SIGNALGUARD_INGESTION_SYMBOLS=BTCUSDT cargo run
```

Notes:

- Live mode uses Binance public `trade`, `bookTicker`, and `depth` WebSocket streams only.
- No API keys are required.
- The service does not submit, cancel, or route exchange orders.
- Internet access is required.
- Live mode does not reset PostgreSQL history automatically.
- Ordinary Live startup and restart preserve and validate existing SignalGuard latest-state Redis entries before ingestion resumes.
- An empty latest-state cache is valid. Missing, malformed, non-canonical, or symbol-mismatched preserved entries cause explicit degraded cache operation; startup does not silently trust, repair, or delete them.
- `SIGNALGUARD_REPLAY_RESET_STATE` is Replay-only and cannot make Live startup destructive.
- The local depth view is still a simplified top-N runtime book without REST snapshot bootstrap or resync.

## Manual Live restart cache-preservation smoke

Use only a local or otherwise controlled Redis instance. This smoke seeds one SignalGuard-owned state, starts Live twice, and verifies startup does not erase it before newer events arrive.

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
export REDIS_URL="redis://127.0.0.1:6379"
export SIGNALGUARD_PROFILE=local
export SIGNALGUARD_DATABASE_URL="${DATABASE_URL}"
export SIGNALGUARD_REDIS_URL="${REDIS_URL}"
export SIGNALGUARD_INGESTION_MODE=live
export SIGNALGUARD_INGESTION_SYMBOLS=BTCUSDT
sqlx migrate run

# Seed through a replay or controlled Redis fixture first, then verify:
redis-cli -u "${REDIS_URL}" SISMEMBER signalguard:symbols BTCUSDT
redis-cli -u "${REDIS_URL}" GET signalguard:market_state:BTCUSDT

cargo run 2>&1 | tee /tmp/signalguard-live-first.log
# Stop with Ctrl-C after startup, without clearing Redis.
redis-cli -u "${REDIS_URL}" GET signalguard:market_state:BTCUSDT

cargo run 2>&1 | tee /tmp/signalguard-live-second.log
# Stop with Ctrl-C after startup.
redis-cli -u "${REDIS_URL}" GET signalguard:market_state:BTCUSDT
rg "preserve_and_validate|preserved and validated" /tmp/signalguard-live-first.log /tmp/signalguard-live-second.log
```

The state should remain present across both startups until Live ingestion replaces it with a newer valid value. When Binance access is unavailable, perform the same check with a deterministic seeded state and stop immediately after the preserve/validate startup log.

Intentional cleanup remains explicit:

```bash
SIGNALGUARD_INGESTION_MODE=replay \
SIGNALGUARD_REPLAY_RESET_STATE=true \
SIGNALGUARD_REPLAY_RESET_STORAGE=false \
cargo run
```

This targeted Replay reset removes only `signalguard:market_state:*` and `signalguard:symbols`. It does not use `FLUSHDB` or delete unrelated Redis keys.

## Reading `/metrics`

Main groups:

- Aggregate counters:
  `signalguard_parse_errors_total`, `signalguard_reconnect_attempts_total`, `signalguard_storage_errors_total`, `signalguard_cache_errors_total`
- Source and event processed counters:
  `signalguard_events_processed_total{source="...",event_type="..."}`
- Source parse and reconnect counters:
  `signalguard_source_parse_errors_total{source="..."}` and `signalguard_source_reconnect_attempts_total{source="binance"}`
- Last message freshness:
  `signalguard_last_message_age_ms`

This project does not ship a Grafana dashboard or a larger metrics framework in this v0.4 checkpoint.

## Reading `/pipeline/health`

`GET /pipeline/health` is service and ingestion-pipeline health, not market health.

Key points:

- No processed message yet means degraded status.
- Old last-message age also degrades status.
- Parse, storage, and cache errors contribute to degraded or unhealthy status.
- Unhealthy requires clearly stale message flow together with concerning errors.

## Reading `/market/{symbol}/health`

`GET /market/{symbol}/health` is a per-symbol market-data health view.

Key points:

- It is penalty-based and explainable.
- It is separate from `/pipeline/health`.
- It is not trading advice.

## Optional integration tests

Normal `cargo test` does not require Docker, PostgreSQL, or Redis.

PostgreSQL integration tests:

```bash
docker compose up -d postgres
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
sqlx migrate run
cargo test --test postgres_storage -- --ignored
docker compose down
```

Redis integration tests:

```bash
docker compose up -d redis
export REDIS_URL="redis://127.0.0.1:6379"
cargo test --test redis_cache -- --ignored
docker compose down
```

Replay end-to-end integration test:

```bash
docker compose up -d postgres redis
export DATABASE_URL="postgres://signalguard:signalguard@localhost:5432/signalguard"
export REDIS_URL="redis://127.0.0.1:6379"
sqlx migrate run
cargo test --test replay_e2e -- --ignored
docker compose down
```

This ignored target is manual and includes both the default trade/quote replay E2E and the depth replay E2E that uses `examples/replay/depth_gap_sample.jsonl`.

Replay historical timestamps can trigger `stale_data` and `event_lag_spike` anomalies in these manual E2E runs.

## Common failure cases

- Docker daemon not running:
  `docker compose up` fails before PostgreSQL or Redis start.
- `sqlx-cli` missing:
  `sqlx migrate run` is unavailable until `sqlx-cli` is installed locally.
- `DATABASE_URL` missing:
  `sqlx migrate run` and PostgreSQL-backed ignored tests fail early.
- PostgreSQL unavailable:
  service startup fails because historical storage is required.
- Redis unavailable:
  service starts in degraded mode and latest-state endpoints return `503`.
- `SIGNALGUARD_PROFILE=local` or `SIGNALGUARD_PROFILE=production` without explicit storage/cache URLs:
  service startup fails before connecting to PostgreSQL or Redis.
- Binance unavailable or network blocked:
  live mode retries with bounded exponential backoff.
- Replay historical timestamps:
  replay mode can produce `stale_data` anomalies and degraded market health by design.
- Port already in use:
  the HTTP server fails to bind `SIGNALGUARD_HOST:SIGNALGUARD_PORT`.
- Invalid preserved Redis latest-state cache:
  service increments the cache-error counter once, logs validation context, degrades the runtime cache handle, and leaves invalid data untouched for operator inspection. Use an explicit Replay state reset or targeted operator cleanup when deletion is intended.
- Redis reset failure:
  service logs reset-specific context and degrades without broad database cleanup.
- Event channel backpressure:
  if the pipeline or downstream storage/cache is slow, replay and live await on the bounded channel instead of dropping events.

## Cleanup commands

```bash
docker compose down
rm -rf target
find . -name ".DS_Store" -delete
```

Archive command with exclusions if needed:

```bash
zip -r signalguard-rs-v0.4.zip signalguard-rs-v0.4 \
  -x "signalguard-rs-v0.4/target/*" \
  -x "signalguard-rs-v0.4/.git/*" \
  -x "signalguard-rs-v0.4/.idea/*" \
  -x "signalguard-rs-v0.4/.vscode/*" \
  -x "*/.DS_Store" \
  -x "__MACOSX/*" \
  -x "*/__MACOSX/*"
```

## Runtime mode operator control

Runtime switching remains disabled by default. `SIGNALGUARD_ENABLE_RUNTIME_SWITCH=false` makes `GET /runtime/mode` report `switching_supported: false`, and `POST /runtime/mode` returns `403 Forbidden`. Public deployments should keep this gate disabled unless an operator-controlled environment intentionally enables runtime changes. Moving this route to a private listener is outside this release checkpoint.

When the gate is enabled, reset flags are independent and non-destructive when omitted:

- omitted `reset_state` resolves to `false`;
- omitted `reset_storage` resolves to `false`;
- Redis latest-state reset requires `"reset_state": true`;
- PostgreSQL Replay-history reset requires `"reset_storage": true`.

Ordinary non-destructive switch:

```bash
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8080/runtime/mode \
  --header 'content-type: application/json' \
  --data '{"mode":"live","symbols":["BTCUSDT","ETHUSDT"]}'
```

Explicit Redis latest-state reset only:

```bash
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8080/runtime/mode \
  --header 'content-type: application/json' \
  --data '{"mode":"replay","reset_state":true}'
```

Explicit PostgreSQL Replay-history reset only:

```bash
curl --fail-with-body --silent --show-error \
  --request POST http://127.0.0.1:8080/runtime/mode \
  --header 'content-type: application/json' \
  --data '{"mode":"replay","reset_storage":true}'
```

Omitting both flags preserves both stores. Explicit `false` is equivalent to omission for that flag. These runtime-control semantics do not change the P1-MP06 startup cache policy or Replay startup reset settings.

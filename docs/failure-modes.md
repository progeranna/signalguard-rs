# Failure Modes

This document summarizes the current MVP behavior for expected degraded and fatal conditions.

## Startup behavior

- PostgreSQL unavailable at startup: the service fails to start. Historical storage is required for the MVP, so startup does not continue without PostgreSQL.
- Redis unavailable at startup: the service starts in degraded mode. `GET /symbols` and `GET /market/{symbol}/state` return `503` until the latest-state cache is available.
- Redis cache cleanup failure at startup: the service degrades instead of continuing with potentially stale latest-state cache entries from a previous run.
- Replay startup resets the `trades`, `quotes`, and `anomalies` tables by default so repeated replay runs produce deterministic API output.
- `SIGNALGUARD_REPLAY_RESET_STORAGE=false` disables that replay reset and preserves existing PostgreSQL history.

## Ingestion behavior

- Replay fixture parse failure: replay mode returns a fatal error. This is intentional because replay fixtures are deterministic local demo inputs and malformed data should be fixed at the source fixture.
- Live Binance malformed payload: the payload is logged, the parse error counter is incremented, and live ingestion continues.
- Live Binance connection failure or stream drop: the client retries with bounded exponential backoff and increments the reconnect counter on each retry attempt.

## Storage and cache behavior

- PostgreSQL write failure during ingestion: the write error is logged and counted. In-memory state and Redis latest-state cache may still advance for that event.
- Redis write failure during ingestion: the cache error is logged and counted. PostgreSQL historical writes may still succeed.
- Storage or cache failures during API requests: request handlers return `500` for storage errors and `503` for unavailable latest-state cache, while incrementing the corresponding internal counters.

## Detector and health behavior

- Replay historical timestamps: replay fixtures use fixed historical `event_time` values, so `stale_data` anomalies and `degraded` or `unhealthy` health scores are expected unless the fixture timestamps are near the current clock.
- Live mode never clears historical tables automatically. If replay data was written to the same database and you want isolated live health output, start live mode with a fresh database or clear the replay data first.
- Sliding-window state and trade-burst baseline: these are in-memory only. They are lost on restart in the MVP and are not rebuilt from PostgreSQL or Redis.

## Current limitations

- No retention, partitioning, or downsampling is implemented yet.
- No Prometheus `/metrics` endpoint is implemented yet. Internal counters are in-process only.

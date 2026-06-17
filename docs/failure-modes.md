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
- Live Binance malformed payload from `trade`, `bookTicker`, or `depth`: the payload is logged, the parse error counter is incremented, and live ingestion continues.
- Live Binance connection failure or stream drop: the client retries with bounded exponential backoff and increments the reconnect counter on each retry attempt. Depth streams reconnect through the same combined-stream path as trades and quotes.
- Slow pipeline or downstream storage/cache: replay and live ingestion backpressure on the bounded event channel by awaiting `send()`. The current MVP does not silently drop events when the channel is full.

## Storage and cache behavior

- PostgreSQL write failure during ingestion: the write error is logged and counted. In-memory state and Redis latest-state cache may still advance for that event.
- Redis write failure during ingestion: the cache error is logged and counted. PostgreSQL historical writes may still succeed.
- Storage or cache failures during API requests: request handlers return `500` for storage errors and `503` for unavailable latest-state cache, while incrementing the corresponding internal counters.

## Detector and health behavior

- Replay historical timestamps: replay fixtures use fixed historical `event_time` values, so `stale_data`, `event_lag_spike`, and `degraded` or `unhealthy` health scores are expected unless the fixture timestamps are near the current clock.
- Live mode never clears historical tables automatically. If replay data was written to the same database and you want isolated live health output, start live mode with a fresh database or clear the replay data first.
- Sliding-window state and trade-burst baseline: these are in-memory only. They are lost on restart in the MVP and are not rebuilt from PostgreSQL or Redis.
- Local order book sequence gaps: the in-memory order book can count gaps in depth update IDs and the latest market state exposes that count after depth events are routed through the pipeline. There is no REST snapshot bootstrap or resync yet. When a gap is observed, the count is incremented and the update is still applied.
- `quote_stuck`, `event_lag_spike`, and `depth_sequence_gap` are data-quality heuristics based on the latest market state. They flag unchanged top-of-book signatures, event-to-ingest lag, and local gap-count increases, but they are not evidence of intentional manipulation.

## Current limitations

- No retention, partitioning, or downsampling is implemented yet.
- `GET /metrics` exposes only small fixed process-wide and source-aware counters. Per-symbol metrics and broader observability surfaces are not implemented yet.
- The ingestion-to-pipeline channel is bounded and configurable, but queue depth is not currently exposed on `GET /metrics`.
- `GET /pipeline/health` is a simple heuristic summary. It degrades when no recent message has been processed or parse/storage/cache errors are present, and only reports `unhealthy` for clearly stale message flow combined with errors.

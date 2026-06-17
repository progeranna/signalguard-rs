# Replay Fixtures

These files are normalized SignalGuard replay inputs. They are not raw Binance payloads.

| Fixture | Purpose | Expected notable output |
|---|---|---|
| `sample.jsonl` | Trade and quote replay for `BTCUSDT` and `ETHUSDT`. | Latest trade and quote state, spread and trade-rate signals, and replay timestamp freshness anomalies such as `stale_data`. |
| `depth_sample.jsonl` | Depth replay for local order-book updates without an intentional gap. | Non-null depth-derived fields such as `top_bid_quantity`, `top_ask_quantity`, liquidity fields, and `last_depth_event_time`. |
| `depth_gap_sample.jsonl` | Depth replay with a deliberate update-ID gap. | `depth_sequence_gap_count == 1` in latest state and a `depth_sequence_gap` anomaly when the detector path is active. |

- Fixtures use deterministic historical timestamps.
- Normal `cargo test` does not require Docker, PostgreSQL, Redis, or Binance network access.
- Ignored replay E2E coverage uses these fixtures together with local PostgreSQL and Redis.

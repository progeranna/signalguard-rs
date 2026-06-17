# Self-Review Checklist

- [ ] `cargo fmt --check`
- [ ] `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] `cargo test`
- [ ] `docker compose config`
- [ ] Optional PostgreSQL integration tests completed or intentionally skipped with reason
- [ ] Optional Redis integration tests completed or intentionally skipped with reason
- [ ] Optional replay E2E integration test completed or intentionally skipped with reason
- [ ] Replay smoke test completed
- [ ] `/metrics` smoke check completed or intentionally skipped with reason
- [ ] `/pipeline/health` smoke check completed or intentionally skipped with reason
- [ ] Live smoke test completed or intentionally skipped with reason
- [ ] README feature claims match implementation
- [ ] `docs/operations.md` matches the current local runbook behavior
- [ ] No trading bot, prediction, or manipulation-detection overclaim remains
- [ ] No secrets are committed
- [ ] No `target/`, `.DS_Store`, `.idea/`, `.vscode/`, or `__MACOSX/` artifacts remain
- [ ] Limitations are documented
- [ ] Roadmap is documented

Project-specific review points:

- [ ] Replay mode remains the deterministic default demo path
- [ ] Replay storage reset stays enabled by default and remains configurable through `SIGNALGUARD_REPLAY_RESET_STORAGE`
- [ ] Live mode uses Binance public WebSocket streams only
- [ ] Replay and live share the same normalized event pipeline
- [ ] Replay and live still use the bounded event channel and apply backpressure instead of dropping events
- [ ] PostgreSQL remains the historical store for trades, quotes, and anomalies
- [ ] Normal `cargo test` still does not require Docker or PostgreSQL
- [ ] Redis remains a latest-state cache only
- [ ] Normal `cargo test` still does not require Docker or Redis
- [ ] Normal `cargo test` still does not run the optional replay E2E path
- [ ] Sliding windows and trade-burst baseline remain in-memory and restart-volatile
- [ ] Health score remains heuristic, deterministic, explainable, and not trading advice
- [ ] Internal counters remain in-process and are exposed only through the small `/metrics` endpoint

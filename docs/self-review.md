# Self-Review Checklist

- [ ] `cargo fmt --check`
- [ ] `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] `cargo test`
- [ ] `docker compose config`
- [ ] Replay smoke test completed
- [ ] Live smoke test completed or intentionally skipped with reason
- [ ] README feature claims match implementation
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
- [ ] PostgreSQL remains the historical store for trades, quotes, and anomalies
- [ ] Redis remains a latest-state cache only
- [ ] Sliding windows and trade-burst baseline remain in-memory and restart-volatile
- [ ] Health score remains heuristic, deterministic, explainable, and not trading advice
- [ ] Internal counters remain in-process only and are not exposed as `/metrics`

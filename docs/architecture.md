# Architecture

SignalGuard routes both replay fixtures and live Binance streams through the same normalized event path.

```text
Replay JSONL fixtures
        |
        v
Replay parser / normalizer
        |
        v
      NormalizedEvent pipeline
        |
        +--> PostgreSQL trades
        +--> PostgreSQL quotes
        +--> MarketStateAggregator
        |         |
        |         +--> Redis latest state cache
        |         |
        |         +--> DetectorEngine
        |                    |
        |                    v
        |              PostgreSQL anomalies
        |
        v
   Axum API reads Redis latest state + PostgreSQL anomalies

Binance public WebSocket
        |
        v
Binance parser / normalizer
        |
        v
same NormalizedEvent pipeline
```

API surface:

- `GET /health`
- `GET /symbols`
- `GET /market/{symbol}/state`
- `GET /anomalies`
- `GET /market/{symbol}/health`

Data ownership:

- PostgreSQL stores historical trades, quotes, and anomalies.
- Redis stores only the latest market state snapshot per symbol.
- Sliding windows and trade-burst baseline stay in memory for the MVP.

# Web Console Scope

SignalGuard RS v0.5.0 introduces a public read-only web console for exploring market-data quality signals from the existing backend. The console is intended to make the service easier to understand in a browser without changing the backend's monitoring focus: public market data in, explainable health and anomaly views out.

## MVP Sitemap

- `/`
- `/dashboard`
- `/symbols/:symbol`
- `/anomalies`
- `/architecture`

## Pages

### `/`

Landing page for the project and public demo.

Primary goals:

- explain what SignalGuard RS monitors
- direct visitors to the dashboard and anomaly explorer
- clarify that the product is a market-data quality monitor, not a trading system
- link to architecture and API documentation

Recommended content:

- short product summary
- current demo capabilities
- key signals surfaced by the backend
- clear links into the read-only console views

### `/dashboard`

Default console entry point for operational visibility across tracked symbols.

Primary goals:

- show overall service and market-data status at a glance
- summarize tracked symbols from `GET /symbols`
- surface latest per-symbol health and state using existing symbol endpoints
- highlight recent anomalies for fast drill-down

Recommended content:

- symbol list or cards
- latest spread, price move, trade activity, and freshness indicators
- recent anomaly preview
- links to symbol detail pages

The MVP can use `GET /dashboard/summary` as the primary dashboard bootstrap endpoint. It is a compact read-only response intended for the future web console and reduces the need to assemble the first dashboard view from multiple separate API calls.

### `/symbols/:symbol`

Detail page for one market symbol such as `BTCUSDT`.

Primary goals:

- show the latest normalized market state
- show the current symbol health view
- show recent anomalies for the same symbol
- present detector output as explainable operational signals

Recommended content:

- latest trade and quote snapshot
- freshness and last-event timing
- health score and penalty reasons
- recent anomalies table filtered by symbol

### `/anomalies`

List and filter view for recent anomaly events across symbols.

Primary goals:

- expose detector output in one public page
- support symbol and limit query controls
- make anomaly types and severities easy to scan

Recommended content:

- recent anomaly table
- filters for symbol and result limit
- links back to symbol detail pages
- short explanation of implemented anomaly types

### `/architecture`

Public architecture overview for the demo and product story.

Primary goals:

- explain replay and live ingestion at a high level
- show how normalized events flow through the bounded pipeline
- explain storage and cache ownership
- explain that the console is a read-only layer on top of the existing API

Recommended content:

- simplified architecture diagram
- short component descriptions
- links to deeper backend documentation in `docs/`

## Frontend Location

The future frontend should live under:

```text
web/
```

It should not use:

```text
frontend/
```

## Recommended Future `web/` Structure

This structure is recommended for the first implementation pass, but should not be created until frontend work begins:

```text
web/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    app/
    pages/
    features/
    shared/
    styles/
```

## Read-Only Public Demo Boundaries

The public demo should remain intentionally narrow:

- read-only browser experience
- public market data only
- no authentication required for MVP
- no write actions, mutations, or operator controls
- no trading, account management, or exchange order flow
- no dependence on private exchange APIs

The console should present current state, recent anomalies, health signals, metrics guidance, and architecture context. It should not behave like a trading terminal.

## Backend Endpoint Usage Matrix

| Page | Purpose | Backend endpoints |
| --- | --- | --- |
| `/` | Product framing, status links, public demo context | `GET /health`, `GET /pipeline/health` |
| `/dashboard` | Cross-symbol overview | `GET /dashboard/summary` |
| `/symbols/:symbol` | Symbol detail | `GET /market/{symbol}/state`, `GET /market/{symbol}/health`, `GET /anomalies?symbol={symbol}&limit={n}` |
| `/anomalies` | Global anomaly explorer | `GET /anomalies`, `GET /symbols` |
| `/architecture` | System explanation and observability context | `GET /health`, `GET /pipeline/health`, `GET /metrics` |

Notes:

- `GET /dashboard/summary` is the intended primary dashboard bootstrap endpoint for the web console.
- It is read-only and frontend-friendly, combining service metadata, pipeline health, tracked symbols, compact per-symbol state and health summaries when available, and recent anomalies.
- If a tracked symbol has no latest market state in Redis, the symbol still appears in the response while `state` and `health` remain `null`.
- `GET /metrics` is useful for architecture and observability context, but it is Prometheus-style text rather than a dashboard-specific JSON payload.

## Frontend Stack Recommendation

Recommended stack for the first web implementation:

- React
- TypeScript
- Vite
- React Router
- lightweight data fetching with browser `fetch`
- a small charting library only if charts are required after the first static UI pass

Guidance:

- keep the frontend static-first and read-only
- prefer `GET /dashboard/summary` for the initial dashboard load and existing symbol/anomaly endpoints for drill-down views
- avoid introducing a frontend-specific server for the MVP
- keep styling simple, clear, and easy to host on a VPS later

## Local-First Implementation Strategy

The first web-console milestone should target local development before deployment work:

1. Build the frontend under `web/` and run it locally against the existing Axum API.
2. Use replay mode as the default development path so the UI has deterministic demo data.
3. Keep API integration limited to existing read-only endpoints.
4. Use `GET /dashboard/summary` as the first dashboard data load, then use symbol and anomaly endpoints for deeper views.
5. Keep the dashboard summary contract read-only and stable so the web console can reuse the same response locally and later on a VPS.

This keeps the MVP small and aligned with the current backend contract.

## Later VPS Deployment Shape

After the local MVP is stable, the likely VPS shape is:

- one Rust backend service process
- one built static frontend bundle from `web/`
- a reverse proxy serving the frontend and routing API requests to Axum
- PostgreSQL and Redis provisioned separately

This later deployment step should preserve the same read-only console contract used locally.

## Explicitly Out Of Scope

The web-console MVP does not include:

- trading views or exchange execution workflows
- private account data
- private exchange APIs
- authentication, user profiles, or multi-user permissions
- admin panels or data-editing controls
- websocket-specific frontend architecture beyond what is needed later
- VPS automation, deployment manifests, or production rollout work
- changes to detector logic or Rust backend behavior

## Safety Note

SignalGuard RS is a market-data quality monitoring service. The public console should use public market data only. It must not place trades, route orders, access private exchange APIs, or imply account-level functionality.

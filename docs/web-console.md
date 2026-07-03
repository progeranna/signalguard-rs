# Web Console Scope

SignalGuard RS includes a public read-only web console for exploring market-data quality signals from the existing backend. The console is intended to make the service easier to understand in a browser without changing the backend's monitoring focus: public market data in, explainable health and anomaly views out.

## MVP Sitemap

- `/`
- `/dashboard`
- `/symbols/:symbol`
- `/anomalies`

## Pages

### `/`

Main dashboard and console entry point.

Primary goals:

- show overall service and market-data status at a glance
- summarize tracked symbols from `GET /dashboard/summary`
- highlight recent anomalies for fast drill-down
- clarify that the product is a market-data quality monitor, not a trading system

Recommended content:

- symbol list or cards
- latest spread, price move, trade activity, and freshness indicators
- recent anomaly preview
- links to symbol detail and anomaly views

### `/dashboard`

Alias for the main dashboard at `/`.

Primary goals:

- preserve a clear dashboard URL for direct links
- render the same dashboard experience as `/`

Recommended content:

- same content as `/`

The dashboard uses `GET /dashboard/summary?mode=demo|live` as its primary bootstrap endpoint. This compact read-only response reduces the need to assemble the first dashboard view from multiple separate API calls.

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

## Frontend Location

The frontend lives under:

```text
web/
```

It should not use:

```text
frontend/
```

## `web/` Structure

The implemented frontend structure is:

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

The console should present current state, recent anomalies, health signals, and metrics guidance. Architecture and system design details live in repository documentation rather than a standalone frontend route. The console should not behave like a trading terminal.

## Backend Endpoint Usage Matrix

| Page | Purpose | Backend endpoints |
| --- | --- | --- |
| `/` | Cross-symbol dashboard entry | `GET /dashboard/summary?mode={demo|live}`, `GET /market/{symbol}/timeline?mode={demo|live}`, `GET /runtime/mode` |
| `/dashboard` | Dashboard alias | `GET /dashboard/summary?mode={demo|live}`, `GET /market/{symbol}/timeline?mode={demo|live}`, `GET /runtime/mode` |
| `/symbols/:symbol` | Symbol detail | `GET /dashboard/summary?mode={demo|live}` |
| `/anomalies` | Global anomaly explorer | Not implemented in W09 |

Notes:

- `GET /dashboard/summary?mode=demo|live` is the primary dashboard bootstrap endpoint for the web console.
- It is read-only and frontend-friendly, combining service metadata, pipeline health, tracked symbols, compact per-symbol state and health summaries when available, and recent anomalies.
- Missing `mode` defaults to `demo`.
- `mode=demo` uses deterministic read-only demo data.
- `mode=live` reads the existing storage/cache-backed live path and freshness depends on backend ingestion being active.
- If a tracked symbol has no latest market state in Redis, the symbol still appears in the response while `state` and `health` remain `null`.
- `GET /runtime/mode` is read-only status only.
- `POST /runtime/mode` is not used by the public UI and is disabled by default unless an operator explicitly enables it with `SIGNALGUARD_ENABLE_RUNTIME_SWITCH=true`.

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
- prefer `GET /dashboard/summary?mode=demo|live` for the initial dashboard load and existing read-only drill-down endpoints for deeper views
- avoid introducing a frontend-specific server for the MVP
- keep styling simple, clear, and easy to host on a VPS later

## Local-First Implementation Strategy

The first web-console milestone should target local development before deployment work:

1. Run the frontend under `web/` locally against the existing Axum API.
2. Use replay mode as the default development path when you want deterministic backend data for the console.
3. Keep public API integration limited to existing read-only endpoints.
4. Use `GET /dashboard/summary?mode=demo|live` as the first dashboard data load, then use the timeline and summary-backed symbol views for deeper inspection.
5. Keep the read-only mode-aware contracts stable so the web console can reuse the same behavior locally and later on a VPS.

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

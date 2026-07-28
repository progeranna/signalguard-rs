import { orderMarketEntries } from "./marketOrder";
import type { DashboardSymbolSummary } from "./types";

export const MARKET_HEALTH_PREVIEW_LIMIT = 7;

type DashboardHealthSummary = NonNullable<DashboardSymbolSummary["health"]>;
type DashboardStateSummary = NonNullable<DashboardSymbolSummary["state"]>;

export type MarketHealthPreviewRow = Readonly<{
  key: string;
  symbol: DashboardSymbolSummary["symbol"];
  source: DashboardSymbolSummary["source"];
  availability: DashboardSymbolSummary["availability"];
  observed: boolean;
  healthScore: DashboardHealthSummary["score"] | null;
  healthStatus: DashboardHealthSummary["status"] | null;
  lastTradePrice: DashboardStateSummary["last_trade_price"];
  spreadPct: DashboardStateSummary["spread_pct"];
  tradesPerMinute: DashboardStateSummary["trades_per_minute"];
  lastEventAgeMs: DashboardStateSummary["last_event_age_ms"];
}>;

export type MarketHealthPreviewResult = Readonly<{
  allRows: readonly MarketHealthPreviewRow[];
  rows: readonly MarketHealthPreviewRow[];
  limit: number;
  totalCount: number;
  hiddenCount: number;
  hasMore: boolean;
  isEmpty: boolean;
}>;

export function createMarketHealthPreviewRow(
  summary: DashboardSymbolSummary,
): MarketHealthPreviewRow {
  const observed = summary.availability === "observed";

  return {
    key: `${summary.source}:${summary.symbol}`,
    symbol: summary.symbol,
    source: summary.source,
    availability: summary.availability,
    observed,
    healthScore: observed ? (summary.health?.score ?? null) : null,
    healthStatus: observed ? (summary.health?.status ?? null) : null,
    lastTradePrice: observed ? (summary.state?.last_trade_price ?? null) : null,
    spreadPct: observed ? (summary.state?.spread_pct ?? null) : null,
    tradesPerMinute: observed ? (summary.state?.trades_per_minute ?? null) : null,
    lastEventAgeMs: observed ? (summary.state?.last_event_age_ms ?? null) : null,
  };
}

export function buildMarketHealthPreview(
  summaries: readonly DashboardSymbolSummary[],
  limit: number = MARKET_HEALTH_PREVIEW_LIMIT,
): MarketHealthPreviewResult {
  assertPreviewLimit(limit);

  const allRows = orderMarketEntries([...summaries], (summary) => summary.symbol).map(
    createMarketHealthPreviewRow,
  );
  const rows = allRows.slice(0, limit);
  const totalCount = allRows.length;
  const hiddenCount = Math.max(totalCount - rows.length, 0);

  return {
    allRows,
    rows,
    limit,
    totalCount,
    hiddenCount,
    hasMore: hiddenCount > 0,
    isEmpty: totalCount === 0,
  };
}

function assertPreviewLimit(limit: number): void {
  if (!Number.isFinite(limit) || !Number.isInteger(limit)) {
    throw new TypeError("limit must be a finite integer");
  }

  if (limit < 0) {
    throw new RangeError("limit must be non-negative");
  }
}

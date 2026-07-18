import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

import {
  buildMarketCatalog,
  marketCatalogDashboardSymbols,
} from "./marketCatalog";
import { parseSymbolId, requireSymbolId } from "./symbolId";

import {
  dashboardSummarySchema,
  marketTimelineSchema,
  runtimeModeResponseSchema,
  type DashboardSummary,
  type MarketTimeline,
  type RuntimeModeResponse,
  type UiMode,
} from "./types";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;
export const marketTimelineQueryKeyRoot = ["market", "timeline"] as const;
export const runtimeModeQueryKey = ["runtime", "mode"] as const;
const DASHBOARD_REFRESH_INTERVAL_MS = 5_000;

function withMode(path: string, mode: UiMode): string {
  const params = new URLSearchParams({ mode });
  const search = params.toString();

  return search ? `${path}?${search}` : path;
}

export function fetchDashboardSummary(mode: UiMode): Promise<DashboardSummary> {
  return fetchJson(withMode("/dashboard/summary", mode), {
    schema: dashboardSummarySchema,
  });
}

export function dashboardSummaryQueryKeyForMode(mode: UiMode) {
  return [...dashboardSummaryQueryKey, mode] as const;
}

export function marketTimelineQueryKeyRootForMode(mode: UiMode) {
  return [...marketTimelineQueryKeyRoot, mode] as const;
}

export function marketTimelineQueryKey(
  symbol: string | null | undefined,
  mode: UiMode,
) {
  return [
    ...marketTimelineQueryKeyRootForMode(mode),
    parseSymbolId(symbol),
  ] as const;
}

export function fetchMarketTimeline(symbol: string, mode: UiMode): Promise<MarketTimeline> {
  const symbolId = requireSymbolId(symbol);

  return fetchJson(
    withMode(`/market/${encodeURIComponent(symbolId)}/timeline`, mode),
    {
      schema: marketTimelineSchema,
    },
  );
}

export function fetchRuntimeMode(): Promise<RuntimeModeResponse> {
  return fetchJson("/runtime/mode", {
    schema: runtimeModeResponseSchema,
  });
}

export function useDashboardSummaryQuery(mode: UiMode) {
  return useQuery({
    queryKey: dashboardSummaryQueryKeyForMode(mode),
    queryFn: () => fetchDashboardSummary(mode),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useCatalogDashboardSummaryQuery(mode: UiMode) {
  const dashboardSummaryQuery = useDashboardSummaryQuery(mode);
  const runtimeModeQuery = useRuntimeModeQuery(mode === "live");
  const summary = dashboardSummaryQuery.data;

  return {
    ...dashboardSummaryQuery,
    data: summary
      ? {
          ...summary,
          symbols: marketCatalogDashboardSymbols(
            buildMarketCatalog({
              configuredSymbols: runtimeModeQuery.data?.symbols ?? [],
              mode,
              observedSymbols: summary.symbols,
            }),
          ),
        }
      : summary,
  };
}

export function useMarketTimelineQuery(symbol: string | null | undefined, mode: UiMode) {
  const symbolId = parseSymbolId(symbol);

  return useQuery({
    queryKey: marketTimelineQueryKey(symbolId, mode),
    queryFn: () => fetchMarketTimeline(symbolId ?? "", mode),
    enabled: symbolId !== null,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useRuntimeModeQuery(enabled = true) {
  return useQuery({
    queryKey: runtimeModeQueryKey,
    queryFn: fetchRuntimeMode,
    enabled,
  });
}

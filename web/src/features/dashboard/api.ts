import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

import {
  dashboardSummaryQueryKeyForMode,
  marketAnomaliesQueryKey,
  marketHealthQueryKey,
  marketStateQueryKey,
  marketTimelineQueryKey,
  runtimeModeQueryKey,
} from "./queryKeys";
import { parseSymbolId, requireSymbolId } from "./symbolId";

import {
  anomaliesResponseSchema,
  dashboardSummarySchema,
  marketHealthSchema,
  marketStateSchema,
  marketTimelineSchema,
  runtimeModeResponseSchema,
  type AnomaliesResponse,
  type DashboardSummary,
  type MarketHealth,
  type MarketState,
  type MarketTimeline,
  type RuntimeModeResponse,
  type UiMode,
} from "./types";

export {
  dashboardSummaryQueryKey,
  dashboardSummaryQueryKeyForMode,
  marketAnomaliesQueryKey,
  marketAnomaliesQueryKeyRoot,
  marketHealthQueryKey,
  marketHealthQueryKeyRoot,
  marketStateQueryKey,
  marketStateQueryKeyRoot,
  marketTimelineQueryKey,
  marketTimelineQueryKeyRoot,
  marketTimelineQueryKeyRootForMode,
  runtimeModeQueryKey,
} from "./queryKeys";

export const SYMBOL_ANOMALY_LIMIT = 50;
const DASHBOARD_REFRESH_INTERVAL_MS = 5_000;

function withMode(path: string, mode: UiMode): string {
  const params = new URLSearchParams({ mode });
  const search = params.toString();

  return search ? `${path}?${search}` : path;
}

function fetchDashboardSummary(
  mode: UiMode,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  return fetchJson(withMode("/dashboard/summary", mode), {
    schema: dashboardSummarySchema.refine(
      (summary) => summary.source === mode,
      "dashboard summary source does not match requested mode",
    ),
    signal,
  });
}

function fetchMarketState(
  symbol: string,
  signal?: AbortSignal,
): Promise<MarketState> {
  const symbolId = requireSymbolId(symbol);

  return fetchJson(`/market/${encodeURIComponent(symbolId)}/state`, {
    schema: marketStateSchema,
    signal,
  });
}

function fetchMarketHealth(
  symbol: string,
  signal?: AbortSignal,
): Promise<MarketHealth> {
  const symbolId = requireSymbolId(symbol);

  return fetchJson(`/market/${encodeURIComponent(symbolId)}/health`, {
    schema: marketHealthSchema,
    signal,
  });
}

function fetchMarketTimeline(
  symbol: string,
  mode: UiMode,
  signal?: AbortSignal,
): Promise<MarketTimeline> {
  const symbolId = requireSymbolId(symbol);

  return fetchJson(
    withMode(`/market/${encodeURIComponent(symbolId)}/timeline`, mode),
    {
      schema: marketTimelineSchema.refine(
        (timeline) => timeline.source === mode,
        "market timeline source does not match requested mode",
      ),
      signal,
    },
  );
}

function fetchMarketAnomalies(
  symbol: string,
  limit = SYMBOL_ANOMALY_LIMIT,
  signal?: AbortSignal,
): Promise<AnomaliesResponse> {
  const symbolId = requireSymbolId(symbol);

  return fetchJson("/anomalies", {
    query: { limit, symbol: symbolId },
    schema: anomaliesResponseSchema,
    signal,
  });
}

export function fetchRuntimeMode(signal?: AbortSignal): Promise<RuntimeModeResponse> {
  return fetchJson("/runtime/mode", {
    schema: runtimeModeResponseSchema,
    signal,
  });
}

export function useDashboardSummaryQuery(mode: UiMode, enabled = true) {
  return useQuery({
    queryKey: dashboardSummaryQueryKeyForMode(mode),
    queryFn: ({ signal }) => fetchDashboardSummary(mode, signal),
    enabled,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useCatalogDashboardSummaryQuery(mode: UiMode) {
  const dashboardSummaryQuery = useDashboardSummaryQuery(mode);
  return dashboardSummaryQuery;
}

export function useMarketStateQuery(
  symbol: string | null | undefined,
  mode: UiMode,
  enabled = true,
) {
  const symbolId = parseSymbolId(symbol);

  return useQuery({
    queryKey: marketStateQueryKey(symbolId, mode),
    queryFn: ({ signal }) => fetchMarketState(symbolId ?? "", signal),
    enabled: enabled && mode === "live" && symbolId !== null,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useMarketHealthQuery(
  symbol: string | null | undefined,
  mode: UiMode,
  enabled = true,
) {
  const symbolId = parseSymbolId(symbol);

  return useQuery({
    queryKey: marketHealthQueryKey(symbolId, mode),
    queryFn: ({ signal }) => fetchMarketHealth(symbolId ?? "", signal),
    enabled: enabled && mode === "live" && symbolId !== null,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useMarketTimelineQuery(
  symbol: string | null | undefined,
  mode: UiMode,
  enabled = true,
) {
  const symbolId = parseSymbolId(symbol);

  return useQuery({
    queryKey: marketTimelineQueryKey(symbolId, mode),
    queryFn: ({ signal }) => fetchMarketTimeline(symbolId ?? "", mode, signal),
    enabled: enabled && symbolId !== null,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useMarketAnomaliesQuery(
  symbol: string | null | undefined,
  mode: UiMode,
  limit = SYMBOL_ANOMALY_LIMIT,
  enabled = true,
) {
  const symbolId = parseSymbolId(symbol);

  return useQuery({
    queryKey: marketAnomaliesQueryKey(symbolId, mode, limit),
    queryFn: ({ signal }) =>
      fetchMarketAnomalies(symbolId ?? "", limit, signal),
    enabled: enabled && mode === "live" && symbolId !== null,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useRuntimeModeQuery(enabled = true) {
  return useQuery({
    queryKey: runtimeModeQueryKey,
    queryFn: ({ signal }) => fetchRuntimeMode(signal),
    enabled,
  });
}

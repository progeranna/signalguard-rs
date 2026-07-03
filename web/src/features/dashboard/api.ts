import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

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

export function marketTimelineQueryKey(symbol: string, mode: UiMode) {
  return [...marketTimelineQueryKeyRootForMode(mode), symbol] as const;
}

export function fetchMarketTimeline(symbol: string, mode: UiMode): Promise<MarketTimeline> {
  return fetchJson(withMode(`/market/${encodeURIComponent(symbol)}/timeline`, mode), {
    schema: marketTimelineSchema,
  });
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

export function useMarketTimelineQuery(symbol: string | null | undefined, mode: UiMode) {
  return useQuery({
    queryKey: marketTimelineQueryKey(symbol ?? "", mode),
    queryFn: () => fetchMarketTimeline(symbol ?? "", mode),
    enabled: Boolean(symbol),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useRuntimeModeQuery() {
  return useQuery({
    queryKey: runtimeModeQueryKey,
    queryFn: fetchRuntimeMode,
  });
}

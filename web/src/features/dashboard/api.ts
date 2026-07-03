import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

import {
  dashboardSummarySchema,
  marketTimelineSchema,
  runtimeModeResponseSchema,
  type DashboardSummary,
  type MarketTimeline,
  type RuntimeModeResponse,
  type RuntimeModeSwitchRequest,
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

export function marketTimelineQueryKey(symbol: string) {
  return [...marketTimelineQueryKeyRoot, symbol] as const;
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

export function switchRuntimeMode(
  request: RuntimeModeSwitchRequest,
): Promise<RuntimeModeResponse> {
  return fetchJson("/runtime/mode", {
    schema: runtimeModeResponseSchema,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  });
}

export function useDashboardSummaryQuery(mode: UiMode) {
  return useQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: () => fetchDashboardSummary(mode),
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
  });
}

export function useMarketTimelineQuery(symbol: string | null | undefined, mode: UiMode) {
  return useQuery({
    queryKey: marketTimelineQueryKey(symbol ?? ""),
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

export function useSwitchRuntimeModeMutation() {
  return useMutation({
    mutationFn: switchRuntimeMode,
  });
}

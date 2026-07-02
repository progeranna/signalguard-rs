import { useMutation, useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

import {
  dashboardSummarySchema,
  runtimeModeResponseSchema,
  type DashboardSummary,
  type RuntimeModeResponse,
  type RuntimeModeSwitchRequest,
} from "./types";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;
export const runtimeModeQueryKey = ["runtime", "mode"] as const;

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return fetchJson("/dashboard/summary", {
    schema: dashboardSummarySchema,
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

export function useDashboardSummaryQuery() {
  return useQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: fetchDashboardSummary,
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

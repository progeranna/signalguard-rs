import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/shared/api/client";

import { dashboardSummarySchema, type DashboardSummary } from "./types";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;

export function fetchDashboardSummary(): Promise<DashboardSummary> {
  return fetchJson("/dashboard/summary", {
    schema: dashboardSummarySchema,
  });
}

export function useDashboardSummaryQuery() {
  return useQuery({
    queryKey: dashboardSummaryQueryKey,
    queryFn: fetchDashboardSummary,
  });
}

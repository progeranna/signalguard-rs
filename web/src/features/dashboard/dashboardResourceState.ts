import type { DashboardSummary } from "./types";

export type DashboardResourceStateInput = Readonly<{
  data: DashboardSummary | null | undefined;
  error: unknown;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
}>;

export type DashboardResourceState =
  | Readonly<{
      isRefreshing: false;
      status: "loading";
    }>
  | Readonly<{
      error: unknown;
      isRefreshing: false;
      status: "error";
    }>
  | Readonly<{
      isRefreshing: boolean;
      reason: "no-data" | "no-markets-and-anomalies";
      refreshError: unknown | null;
      status: "empty";
      summary: DashboardSummary | null;
    }>
  | Readonly<{
      isRefreshing: boolean;
      refreshError: unknown | null;
      status: "success";
      summary: DashboardSummary;
    }>;

export function resolveDashboardResourceState(
  input: DashboardResourceStateInput,
): DashboardResourceState {
  const summary = input.data;

  if (summary != null) {
    const isRefreshing = input.isFetching;
    const refreshError = input.isError ? input.error : null;

    if (summary.symbols.length === 0 && summary.recent_anomalies.length === 0) {
      return {
        isRefreshing,
        reason: "no-markets-and-anomalies",
        refreshError,
        status: "empty",
        summary,
      };
    }

    return {
      isRefreshing,
      refreshError,
      status: "success",
      summary,
    };
  }

  if (input.isLoading || input.isFetching) {
    return { isRefreshing: false, status: "loading" };
  }

  if (input.isError) {
    return {
      error: input.error,
      isRefreshing: false,
      status: "error",
    };
  }

  return {
    isRefreshing: false,
    reason: "no-data",
    refreshError: null,
    status: "empty",
    summary: null,
  };
}

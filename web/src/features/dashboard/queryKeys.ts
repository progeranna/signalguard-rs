import { parseSymbolId } from "./symbolId";
import type { UiMode } from "./types";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;
export const marketStateQueryKeyRoot = ["market", "state"] as const;
export const marketHealthQueryKeyRoot = ["market", "health"] as const;
export const marketTimelineQueryKeyRoot = ["market", "timeline"] as const;
export const marketAnomaliesQueryKeyRoot = ["market", "anomalies"] as const;
export const runtimeModeQueryKey = ["runtime", "mode"] as const;

export function dashboardSummaryQueryKeyForMode(mode: UiMode) {
  return [...dashboardSummaryQueryKey, mode] as const;
}

export function marketStateQueryKey(
  symbol: string | null | undefined,
  mode: UiMode,
) {
  return [...marketStateQueryKeyRoot, mode, parseSymbolId(symbol)] as const;
}

export function marketHealthQueryKey(
  symbol: string | null | undefined,
  mode: UiMode,
) {
  return [...marketHealthQueryKeyRoot, mode, parseSymbolId(symbol)] as const;
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

export function marketAnomaliesQueryKey(
  symbol: string | null | undefined,
  mode: UiMode,
  limit: number,
) {
  return [
    ...marketAnomaliesQueryKeyRoot,
    mode,
    parseSymbolId(symbol),
    limit,
  ] as const;
}

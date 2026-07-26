import { parseSymbolId } from "./symbolId";
import type { UiMode } from "./types";

export const dashboardSummaryQueryKey = ["dashboard", "summary"] as const;
export const marketTimelineQueryKeyRoot = ["market", "timeline"] as const;
export const runtimeModeQueryKey = ["runtime", "mode"] as const;

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

import { describe, expect, it } from "vitest";

import { parseSymbolId, type SymbolId } from "./symbolId";
import {
  dashboardSummaryQueryKey,
  dashboardSummaryQueryKeyForMode,
  marketTimelineQueryKey,
  marketTimelineQueryKeyRoot,
  marketTimelineQueryKeyRootForMode,
  runtimeModeQueryKey,
} from "./queryKeys";

describe("centralized query-key identities", () => {
  it("keeps Demo and Live summary identities distinct", () => {
    expect(dashboardSummaryQueryKeyForMode("demo")).not.toEqual(
      dashboardSummaryQueryKeyForMode("live"),
    );
  });

  it("keeps BTC and ETH timeline identities distinct", () => {
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).not.toEqual(
      marketTimelineQueryKey("ETHUSDT", "demo"),
    );
  });

  it("keeps summary identity distinct from timeline identity", () => {
    expect(dashboardSummaryQueryKeyForMode("demo")).not.toEqual(
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );
  });

  it("keeps runtime identity distinct from market-resource identities", () => {
    expect(runtimeModeQueryKey).not.toEqual(
      dashboardSummaryQueryKeyForMode("demo"),
    );
    expect(runtimeModeQueryKey).not.toEqual(
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );
  });

  it("returns structurally equal serializable keys for equal inputs", () => {
    const first = marketTimelineQueryKey("BTCUSDT", "live");
    const second = marketTimelineQueryKey("BTCUSDT", "live");

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("passes symbol identity through the canonical SymbolId boundary", () => {
    const canonicalSymbol = parseSymbolId(" btcusdt ");
    const key = marketTimelineQueryKey(" btcusdt ", "live");
    const symbolIdentity: SymbolId | null = key[3];

    expect(symbolIdentity).toBe(canonicalSymbol);
    expect(symbolIdentity).toBe("BTCUSDT");
  });

  it("normalizes symbol case and surrounding whitespace consistently", () => {
    expect(marketTimelineQueryKey(" btcusdt ", "demo")).toEqual(
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );
    expect(marketTimelineQueryKey(" eThUsDt ", "live")).toEqual(
      marketTimelineQueryKey("ETHUSDT", "live"),
    );
  });

  it("keeps absent and invalid symbols on the disabled identity", () => {
    const disabledIdentity = marketTimelineQueryKey(null, "demo");

    for (const symbol of [undefined, "", "   ", "BTC-USDT", "BTC/USDT"]) {
      expect(marketTimelineQueryKey(symbol, "demo")).toEqual(disabledIdentity);
    }

    expect(disabledIdentity).toEqual(["market", "timeline", "demo", null]);
    expect(disabledIdentity).not.toEqual(
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );
  });

  it("excludes popup presentation state from server-resource identity", () => {
    const presentationStates = [
      { surface: "route", open: false },
      { surface: "popup", open: true },
    ] as const;
    const keys = presentationStates.map(() =>
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );

    expect(keys[0]).toEqual(keys[1]);
    expect(keys[0]).toHaveLength(4);
    expect(JSON.stringify(keys[0])).not.toContain("popup");
  });

  it("keeps summary identity mode-wide rather than symbol-owned", () => {
    const selectedSymbols = ["BTCUSDT", "ETHUSDT"] as const;
    const keys = selectedSymbols.map(() => dashboardSummaryQueryKeyForMode("live"));

    expect(new Set(keys.map((key) => JSON.stringify(key)))).toHaveLength(1);
    expect(keys[0]).toEqual(["dashboard", "summary", "live"]);
  });

  it("includes every server-data parameter in each parameterized key", () => {
    expect(dashboardSummaryQueryKeyForMode("demo")).not.toEqual(
      dashboardSummaryQueryKeyForMode("live"),
    );
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).not.toEqual(
      marketTimelineQueryKey("BTCUSDT", "live"),
    );
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).not.toEqual(
      marketTimelineQueryKey("ETHUSDT", "demo"),
    );
  });

  it("preserves the established root and root-for-mode shapes", () => {
    expect(dashboardSummaryQueryKey).toEqual(["dashboard", "summary"]);
    expect(marketTimelineQueryKeyRoot).toEqual(["market", "timeline"]);
    expect(marketTimelineQueryKeyRootForMode("demo")).toEqual([
      "market",
      "timeline",
      "demo",
    ]);
    expect(runtimeModeQueryKey).toEqual(["runtime", "mode"]);
  });
});

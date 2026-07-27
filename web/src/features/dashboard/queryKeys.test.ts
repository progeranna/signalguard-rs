import { describe, expect, it } from "vitest";

import { parseSymbolId, type SymbolId } from "./symbolId";
import {
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

const SYMBOL_ANOMALY_LIMIT = 50;
const symbolOwnedFactories = [
  ["state", (symbol: string, mode: "demo" | "live") => marketStateQueryKey(symbol, mode)],
  ["health", (symbol: string, mode: "demo" | "live") => marketHealthQueryKey(symbol, mode)],
  ["timeline", (symbol: string, mode: "demo" | "live") => marketTimelineQueryKey(symbol, mode)],
  [
    "anomalies",
    (symbol: string, mode: "demo" | "live") =>
      marketAnomaliesQueryKey(symbol, mode, SYMBOL_ANOMALY_LIMIT),
  ],
] as const;

describe("symbol-owned query-key identities", () => {
  it.each(symbolOwnedFactories)(
    "keeps Demo and Live %s identities distinct",
    (_family, factory) => {
      expect(factory("BTCUSDT", "demo")).not.toEqual(
        factory("BTCUSDT", "live"),
      );
    },
  );

  it.each(symbolOwnedFactories)(
    "keeps BTC and ETH %s identities distinct",
    (_family, factory) => {
      expect(factory("BTCUSDT", "live")).not.toEqual(
        factory("ETHUSDT", "live"),
      );
    },
  );

  it("keeps every resource family distinct", () => {
    const keys = symbolOwnedFactories.map(([, factory]) =>
      factory("BTCUSDT", "live"),
    );

    expect(new Set(keys.map((key) => JSON.stringify(key)))).toHaveLength(4);
  });

  it.each(symbolOwnedFactories)(
    "returns structurally equal stable serializable %s keys",
    (_family, factory) => {
      const first = factory("BTCUSDT", "live");
      const second = factory("BTCUSDT", "live");

      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    },
  );

  it.each(symbolOwnedFactories)(
    "passes %s symbols through the canonical SymbolId boundary",
    (_family, factory) => {
      const canonicalSymbol = parseSymbolId(" btcusdt ");
      const key = factory(" btcusdt ", "live");
      const symbolIdentity: SymbolId | null = key[3];

      expect(symbolIdentity).toBe(canonicalSymbol);
      expect(symbolIdentity).toBe("BTCUSDT");
    },
  );

  it.each(symbolOwnedFactories)(
    "normalizes case and whitespace for %s",
    (_family, factory) => {
      expect(factory(" eThUsDt ", "demo")).toEqual(
        factory("ETHUSDT", "demo"),
      );
    },
  );

  it.each(symbolOwnedFactories)(
    "keeps absent and invalid %s symbols on a disabled identity",
    (_family, factory) => {
      const disabled = factory("", "live");

      for (const symbol of ["   ", "BTC-USDT", "BTC/USDT"]) {
        expect(factory(symbol, "live")).toEqual(disabled);
      }
      expect(disabled[3]).toBeNull();
      expect(disabled).not.toEqual(factory("BTCUSDT", "live"));
    },
  );

  it("gives route and popup the same server-resource keys", () => {
    const surfaces = [
      { open: false, surface: "route" },
      { open: true, surface: "popup" },
    ] as const;

    for (const [, factory] of symbolOwnedFactories) {
      const keys = surfaces.map(() => factory("BTCUSDT", "live"));
      expect(keys[0]).toEqual(keys[1]);
      expect(JSON.stringify(keys[0])).not.toContain("popup");
      expect(JSON.stringify(keys[0])).not.toContain("route");
      expect(JSON.stringify(keys[0])).not.toContain("open");
    }
  });

  it("includes the anomaly limit because it changes returned server data", () => {
    expect(marketAnomaliesQueryKey("BTCUSDT", "live", 25)).not.toEqual(
      marketAnomaliesQueryKey("BTCUSDT", "live", 50),
    );
    expect(marketAnomaliesQueryKey("BTCUSDT", "live", 50)).toEqual([
      "market",
      "anomalies",
      "live",
      "BTCUSDT",
      50,
    ]);
  });

  it("keeps the complete Demo/Live by BTC/ETH identity matrix unique", () => {
    for (const [, factory] of symbolOwnedFactories) {
      const keys = [
        factory("BTCUSDT", "demo"),
        factory("BTCUSDT", "live"),
        factory("ETHUSDT", "demo"),
        factory("ETHUSDT", "live"),
      ];

      expect(new Set(keys.map((key) => JSON.stringify(key)))).toHaveLength(4);
    }
  });
});

describe("existing mode-wide and runtime identities", () => {
  it("keeps the dashboard summary mode-wide", () => {
    expect(dashboardSummaryQueryKeyForMode("live")).toEqual([
      "dashboard",
      "summary",
      "live",
    ]);
    expect(dashboardSummaryQueryKey).toEqual(["dashboard", "summary"]);
  });

  it("preserves established roots and runtime identity", () => {
    expect(marketStateQueryKeyRoot).toEqual(["market", "state"]);
    expect(marketHealthQueryKeyRoot).toEqual(["market", "health"]);
    expect(marketTimelineQueryKeyRoot).toEqual(["market", "timeline"]);
    expect(marketTimelineQueryKeyRootForMode("demo")).toEqual([
      "market",
      "timeline",
      "demo",
    ]);
    expect(marketAnomaliesQueryKeyRoot).toEqual(["market", "anomalies"]);
    expect(runtimeModeQueryKey).toEqual(["runtime", "mode"]);
  });
});

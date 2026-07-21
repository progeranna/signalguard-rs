import { describe, expect, it } from "vitest";

import {
  dashboardSummaryQueryKey,
  dashboardSummaryQueryKeyForMode,
  marketTimelineQueryKey,
  marketTimelineQueryKeyRoot,
  marketTimelineQueryKeyRootForMode,
  runtimeModeQueryKey,
} from "./api";

describe("dashboard summary query keys", () => {
  it("keeps Demo and Live cache identities distinct", () => {
    expect(dashboardSummaryQueryKeyForMode("demo")).not.toEqual(
      dashboardSummaryQueryKeyForMode("live"),
    );
  });

  it("returns a deterministic key with the summary root and mode", () => {
    expect(dashboardSummaryQueryKeyForMode("demo")).toEqual([
      "dashboard",
      "summary",
      "demo",
    ]);
    expect(dashboardSummaryQueryKeyForMode("live")).toEqual([
      "dashboard",
      "summary",
      "live",
    ]);
    expect(dashboardSummaryQueryKeyForMode("demo")).toEqual(
      dashboardSummaryQueryKeyForMode("demo"),
    );
  });

  it("does not share mutable generated arrays", () => {
    const first = dashboardSummaryQueryKeyForMode("demo");
    const second = dashboardSummaryQueryKeyForMode("demo");

    (first as unknown as string[])[0] = "changed";

    expect(second).toEqual(["dashboard", "summary", "demo"]);
    expect(dashboardSummaryQueryKey).toEqual(["dashboard", "summary"]);
  });
});

describe("market timeline query keys", () => {
  it("keeps mode-specific roots distinct", () => {
    expect(marketTimelineQueryKeyRootForMode("demo")).not.toEqual(
      marketTimelineQueryKeyRootForMode("live"),
    );
    expect(marketTimelineQueryKeyRootForMode("demo")).toEqual([
      "market",
      "timeline",
      "demo",
    ]);
    expect(marketTimelineQueryKeyRootForMode("live")).toEqual([
      "market",
      "timeline",
      "live",
    ]);
  });

  it("keeps Demo and Live identities distinct for the same symbol", () => {
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).not.toEqual(
      marketTimelineQueryKey("BTCUSDT", "live"),
    );
  });

  it("keeps BTC and ETH identities distinct within each mode", () => {
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).not.toEqual(
      marketTimelineQueryKey("ETHUSDT", "demo"),
    );
    expect(marketTimelineQueryKey("BTCUSDT", "live")).not.toEqual(
      marketTimelineQueryKey("ETHUSDT", "live"),
    );
  });

  it("produces four unique identities across the required mode-symbol matrix", () => {
    const keys = [
      marketTimelineQueryKey("BTCUSDT", "demo"),
      marketTimelineQueryKey("BTCUSDT", "live"),
      marketTimelineQueryKey("ETHUSDT", "demo"),
      marketTimelineQueryKey("ETHUSDT", "live"),
    ];

    expect(new Set(keys.map((key) => JSON.stringify(key)))).toHaveLength(4);
  });

  it("returns a deterministic root-mode-symbol order", () => {
    expect(marketTimelineQueryKey("BTCUSDT", "demo")).toEqual([
      "market",
      "timeline",
      "demo",
      "BTCUSDT",
    ]);
    expect(marketTimelineQueryKey("BTCUSDT", "live")).toEqual(
      marketTimelineQueryKey("BTCUSDT", "live"),
    );
  });

  it("canonicalizes equivalent symbol spellings into one cache identity", () => {
    expect(marketTimelineQueryKey(" btcusdt ", "demo")).toEqual(
      marketTimelineQueryKey("BTCUSDT", "demo"),
    );
    expect(marketTimelineQueryKey("eThUsDt", "live")).toEqual(
      marketTimelineQueryKey("ETHUSDT", "live"),
    );
  });

  it.each(["", "   ", "BTC-USDT", "BTC/USDT"])(
    "maps invalid symbol %s to the disabled identity",
    (symbol) => {
      expect(marketTimelineQueryKey(symbol, "demo")).toEqual([
        "market",
        "timeline",
        "demo",
        null,
      ]);
    },
  );

  it("does not share mutable generated arrays", () => {
    const first = marketTimelineQueryKey("BTCUSDT", "demo");
    const second = marketTimelineQueryKey("BTCUSDT", "demo");

    (first as unknown as string[])[3] = "ETHUSDT";

    expect(second).toEqual(["market", "timeline", "demo", "BTCUSDT"]);
    expect(marketTimelineQueryKeyRoot).toEqual(["market", "timeline"]);
  });
});

describe("runtime mode query key", () => {
  it("uses one stable global runtime identity", () => {
    expect(runtimeModeQueryKey).toEqual(["runtime", "mode"]);
  });
});

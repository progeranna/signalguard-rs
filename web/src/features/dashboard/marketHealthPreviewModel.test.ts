// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { DashboardSymbolSummary } from "./types";
import { orderMarketEntries } from "./marketOrder";
import {
  buildMarketHealthPreview,
  createMarketHealthPreviewRow,
  MARKET_HEALTH_PREVIEW_LIMIT,
  type MarketHealthPreviewRow,
} from "./marketHealthPreviewModel";

const modelSourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/marketHealthPreviewModel.ts",
);
const modelSource = readFileSync(modelSourcePath, "utf8");

function staticImportSpecifiers(value: string): string[] {
  return Array.from(
    value.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    (match) => match[1],
  );
}

function runtimeImportSpecifiers(value: string): string[] {
  const withoutTypeImports = value.replace(
    /^\s*import\s+type\b[\s\S]*?;\s*$/gm,
    "",
  );

  return staticImportSpecifiers(withoutTypeImports);
}

function observedSummary(
  symbol: string,
  source: DashboardSymbolSummary["source"] = "live",
): DashboardSymbolSummary {
  return {
    source,
    availability: "observed",
    symbol,
    health: {
      evaluated_at: "2026-07-20T10:00:00.000Z",
      recent_anomaly_count: 2,
      score: 88,
      status: "healthy",
    },
    state: {
      best_ask_price: "101.00",
      best_bid_price: "100.00",
      depth_sequence_gap_count: 0,
      last_event_age_ms: 125,
      last_event_time: "2026-07-20T10:00:00.000Z",
      last_trade_price: "100.50",
      price_change_1m_pct: 1.25,
      spread_pct: 0.5,
      trades_per_minute: 12,
    },
  };
}

function catalog(count: number): DashboardSymbolSummary[] {
  return Array.from({ length: count }, (_, index) =>
    observedSummary(`CUSTOM${String(index).padStart(2, "0")}`),
  );
}

describe("Market Health preview ordering and identity", () => {
  it("uses the exact default preview limit", () => {
    expect(MARKET_HEALTH_PREVIEW_LIMIT).toBe(7);
    expect(buildMarketHealthPreview(catalog(8)).limit).toBe(7);
  });

  it("reuses canonical market ordering for known markets", () => {
    const result = buildMarketHealthPreview([
      observedSummary("DOGEUSDT"),
      observedSummary("ETHUSDT"),
      observedSummary("BTCUSDT"),
      observedSummary("ADAUSDT"),
      observedSummary("SOLUSDT"),
      observedSummary("BNBUSDT"),
      observedSummary("XRPUSDT"),
    ]);

    expect(result.allRows.map(({ symbol }) => symbol)).toEqual([
      "BTCUSDT",
      "ETHUSDT",
      "SOLUSDT",
      "XRPUSDT",
      "BNBUSDT",
      "ADAUSDT",
      "DOGEUSDT",
    ]);
  });

  it("preserves extra-market relative input order after canonical markets", () => {
    const result = buildMarketHealthPreview([
      observedSummary("CUSTOMB"),
      observedSummary("DOGEUSDT"),
      observedSummary("CUSTOMA"),
      observedSummary("BTCUSDT"),
      observedSummary("CUSTOMC"),
    ]);

    expect(result.allRows.map(({ symbol }) => symbol)).toEqual([
      "BTCUSDT",
      "DOGEUSDT",
      "CUSTOMB",
      "CUSTOMA",
      "CUSTOMC",
    ]);
  });

  it("does not mutate the input array or entries", () => {
    const mutableBtc = observedSummary("BTCUSDT");
    const mutableCustom = observedSummary("CUSTOMA");
    const btc = Object.freeze({
      ...mutableBtc,
      health: Object.freeze(mutableBtc.health!),
      state: Object.freeze(mutableBtc.state!),
    });
    const custom = Object.freeze({
      ...mutableCustom,
      health: Object.freeze(mutableCustom.health!),
      state: Object.freeze(mutableCustom.state!),
    });
    const input = Object.freeze([custom, btc]);

    const result = buildMarketHealthPreview(input);

    expect(input).toEqual([custom, btc]);
    expect(result.allRows.map(({ symbol }) => symbol)).toEqual(["BTCUSDT", "CUSTOMA"]);
    expect(input[0]).toBe(custom);
    expect(input[1]).toBe(btc);
  });

  it("derives stable identity from explicit source and symbol, never index", () => {
    const liveRow = createMarketHealthPreviewRow(observedSummary("BTCUSDT", "live"));
    const demoRow = createMarketHealthPreviewRow(observedSummary("BTCUSDT", "demo"));
    const reordered = buildMarketHealthPreview([
      observedSummary("CUSTOMA", "live"),
      observedSummary("BTCUSDT", "live"),
    ]);

    expect(liveRow.key).toBe("live:BTCUSDT");
    expect(demoRow.key).toBe("demo:BTCUSDT");
    expect(liveRow.key).not.toBe(demoRow.key);
    expect(reordered.allRows.find(({ symbol }) => symbol === "BTCUSDT")?.key).toBe(
      "live:BTCUSDT",
    );
  });

  it("preserves source and duplicate source-symbol rows without fallback or synthesis", () => {
    const result = buildMarketHealthPreview([
      observedSummary("CUSTOMLIVE", "live"),
      observedSummary("BTCUSDT", "demo"),
      observedSummary("BTCUSDT", "live"),
    ]);

    expect(result.allRows).toHaveLength(3);
    expect(result.allRows.map(({ key, source, symbol }) => ({ key, source, symbol }))).toEqual([
      { key: "demo:BTCUSDT", source: "demo", symbol: "BTCUSDT" },
      { key: "live:BTCUSDT", source: "live", symbol: "BTCUSDT" },
      { key: "live:CUSTOMLIVE", source: "live", symbol: "CUSTOMLIVE" },
    ]);
  });
});

describe("Market Health preview metric exposure", () => {
  it("preserves observed values exactly, including numeric zero", () => {
    const summary: DashboardSymbolSummary = {
      ...observedSummary("ZEROUSDT"),
      health: {
        evaluated_at: "2026-07-20T10:00:00.000Z",
        recent_anomaly_count: 0,
        score: 0,
        status: "degraded",
      },
      state: {
        best_ask_price: "0.0001",
        best_bid_price: "0.0000",
        depth_sequence_gap_count: 0,
        last_event_age_ms: 0,
        last_event_time: null,
        last_trade_price: "0.0000",
        price_change_1m_pct: 0,
        spread_pct: 0,
        trades_per_minute: 0,
      },
    };

    expect(createMarketHealthPreviewRow(summary)).toEqual({
      key: "live:ZEROUSDT",
      symbol: "ZEROUSDT",
      source: "live",
      availability: "observed",
      observed: true,
      healthScore: 0,
      healthStatus: "degraded",
      lastTradePrice: "0.0000",
      spreadPct: 0,
      tradesPerMinute: 0,
      lastEventAgeMs: 0,
    });
  });

  it("uses null only for absent observed health and state fields", () => {
    const row = createMarketHealthPreviewRow({
      source: "live",
      availability: "observed",
      symbol: "EMPTYUSDT",
      health: null,
      state: null,
    });

    expect(row).toMatchObject({
      observed: true,
      healthScore: null,
      healthStatus: null,
      lastTradePrice: null,
      spreadPct: null,
      tradesPerMinute: null,
      lastEventAgeMs: null,
    });
  });

  it.each(["configured", "awaiting", "unavailable"] as const)(
    "forces every metric to null for %s rows",
    (availability) => {
      const row = createMarketHealthPreviewRow({
        ...observedSummary("SUPPRESSED"),
        availability,
      });

      expect(row).toEqual({
        key: "live:SUPPRESSED",
        symbol: "SUPPRESSED",
        source: "live",
        availability,
        observed: false,
        healthScore: null,
        healthStatus: null,
        lastTradePrice: null,
        spreadPct: null,
        tradesPerMinute: null,
        lastEventAgeMs: null,
      });
    },
  );
});

describe("Market Health preview limits and metadata", () => {
  it.each([
    ["fewer than limit", 3, 7, 3, 0, false],
    ["equal to limit", 7, 7, 7, 0, false],
    ["greater than limit", 9, 7, 7, 2, true],
  ] as const)(
    "reports %s deterministically",
    (_name, total, limit, visible, hidden, hasMore) => {
      const result = buildMarketHealthPreview(catalog(total), limit);

      expect(result).toMatchObject({
        limit,
        totalCount: total,
        hiddenCount: hidden,
        hasMore,
        isEmpty: false,
      });
      expect(result.allRows).toHaveLength(total);
      expect(result.rows).toHaveLength(visible);
    },
  );

  it("supports limit zero while preserving all rows and metadata", () => {
    const result = buildMarketHealthPreview(catalog(2), 0);

    expect(result.rows).toEqual([]);
    expect(result.allRows).toHaveLength(2);
    expect(result).toMatchObject({
      limit: 0,
      totalCount: 2,
      hiddenCount: 2,
      hasMore: true,
      isEmpty: false,
    });
  });

  it.each([
    ["negative", -1, RangeError, "limit must be non-negative"],
    ["fractional", 1.5, TypeError, "limit must be a finite integer"],
    ["NaN", Number.NaN, TypeError, "limit must be a finite integer"],
    ["positive infinity", Number.POSITIVE_INFINITY, TypeError, "limit must be a finite integer"],
    ["negative infinity", Number.NEGATIVE_INFINITY, TypeError, "limit must be a finite integer"],
  ] as const)("rejects %s limits", (_name, limit, errorType, message) => {
    expect(() => buildMarketHealthPreview([], limit)).toThrow(errorType);
    expect(() => buildMarketHealthPreview([], limit)).toThrow(message);
  });

  it("returns the exact empty-input result", () => {
    expect(buildMarketHealthPreview([])).toEqual({
      allRows: [],
      rows: [],
      limit: 7,
      totalCount: 0,
      hiddenCount: 0,
      hasMore: false,
      isEmpty: true,
    });
  });
});

describe("Market Health preview purity", () => {
  it("returns equal values for equal inputs", () => {
    const input = [observedSummary("ETHUSDT"), observedSummary("BTCUSDT")];

    expect(buildMarketHealthPreview(input, 1)).toEqual(buildMarketHealthPreview(input, 1));
  });

  it("matches the public ordering owner and derives stable source-symbol keys", () => {
    const input = [
      observedSummary("CUSTOMB"),
      observedSummary("DOGEUSDT", "demo"),
      observedSummary("BTCUSDT", "live"),
      observedSummary("CUSTOMA"),
    ];
    const expected = orderMarketEntries([...input], (summary) => summary.symbol);
    const result = buildMarketHealthPreview(input);

    expect(result.allRows.map(({ symbol }) => symbol)).toEqual(
      expected.map(({ symbol }) => symbol),
    );
    expect(result.allRows.map(({ key }) => key)).toEqual(
      expected.map(({ source, symbol }) => `${source}:${symbol}`),
    );
    expect(modelSource).not.toMatch(
      /\b(?:summaries|entries|symbols)\s*\.\s*(?:sort|toSorted)\s*\(/,
    );
  });

  it("exposes the exact public row shape without presentation fields", () => {
    const actual = createMarketHealthPreviewRow(observedSummary("BTCUSDT"));
    const expected = {
      key: "live:BTCUSDT",
      symbol: "BTCUSDT",
      source: "live",
      availability: "observed",
      observed: true,
      healthScore: 88,
      healthStatus: "healthy",
      lastTradePrice: "100.50",
      spreadPct: 0.5,
      tradesPerMinute: 12,
      lastEventAgeMs: 125,
    } satisfies MarketHealthPreviewRow;

    expect(actual).toEqual(expected);
  });

  it("contains only the ordering runtime dependency and no external ownership", () => {
    const imports = staticImportSpecifiers(modelSource);
    const runtimeImports = runtimeImportSpecifiers(modelSource);

    expect(imports).toEqual(["./marketOrder", "./types"]);
    expect(runtimeImports).toEqual(["./marketOrder"]);
    expect(modelSource).not.toMatch(/^\s*<\/?[A-Za-z][^>]*>/m);
    expect(modelSource).not.toMatch(
      /(?:window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|Date\.now\s*\(|new\s+Date\s*\(\s*\)|setTimeout|setInterval|Math\.random|process\.env)/,
    );
    expect(modelSource).not.toMatch(/\b(?:Replay|DEMO_MARKETS|Demo fallback|Live fallback)\b/);
  });
});

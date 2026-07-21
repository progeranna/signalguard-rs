import { describe, expect, it } from "vitest";

import {
  DEMO_MARKETS,
  buildMarketCatalog,
  findMarketCatalogEntry,
  getMarketCatalogAvailability,
  marketCatalogDashboardSymbols,
  marketCatalogSymbols,
} from "./marketCatalog";
import { isDashboardSymbolPlaceholder } from "./marketOrder";
import { parseSymbolId } from "./symbolId";
import type { DashboardSymbolSummary } from "./types";

function observedSymbol(symbol: string): DashboardSymbolSummary {
  return {
    symbol,
    state: {
      last_trade_price: "100.00",
      best_bid_price: "99.90",
      best_ask_price: "100.10",
      spread_pct: 0.2,
      price_change_1m_pct: 0.1,
      trades_per_minute: 4,
      last_event_time: "2026-07-17T10:00:00.000Z",
      last_event_age_ms: 1_000,
      depth_sequence_gap_count: 0,
    },
    health: {
      score: 100,
      status: "healthy",
      recent_anomaly_count: 0,
      evaluated_at: "2026-07-17T10:00:00.000Z",
    },
  };
}

describe("market catalog", () => {
  it("keeps the canonical deterministic Demo inventory", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: ["LIVEONLY"],
      mode: "demo",
      observedSymbols: [observedSymbol("BTCUSDT")],
    });

    expect(marketCatalogSymbols(catalog)).toEqual([...DEMO_MARKETS]);
    expect(catalog.every((entry) => entry.availability === "demo")).toBe(true);
    expect(catalog.find((entry) => entry.symbol === "ETHUSDT")?.summary).toEqual({
      symbol: "ETHUSDT",
      state: null,
      health: null,
    });
  });

  it("does not seed Demo-only markets into Live", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: ["ETHUSDT"],
      mode: "live",
      observedSymbols: [observedSymbol("BTCUSDT")],
    });

    expect(marketCatalogSymbols(catalog)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(findMarketCatalogEntry(catalog, "DOGEUSDT")).toBeNull();
  });

  it("marks configured Live markets without a summary as configured-unobserved", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: ["ETHUSDT"],
      mode: "live",
      observedSymbols: [],
    });

    expect(catalog).toEqual([
      {
        availability: "configured-unobserved",
        summary: { symbol: "ETHUSDT", state: null, health: null },
        symbol: "ETHUSDT",
      },
    ]);
  });

  it("marks observed Live markets as observed", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: [],
      mode: "live",
      observedSymbols: [observedSymbol("BTCUSDT")],
    });

    expect(catalog[0]?.availability).toBe("observed");
  });

  it("deduplicates configured and observed identities with observed precedence", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: [" btcusdt ", "BTCUSDT"],
      mode: "live",
      observedSymbols: [observedSymbol("BtCuSdT")],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.symbol).toBe("BTCUSDT");
    expect(catalog[0]?.availability).toBe("observed");
  });

  it("rejects invalid identities instead of fabricating entries", () => {
    const catalog = buildMarketCatalog({
      configuredSymbols: ["", "BTC-USDT", "   "],
      mode: "live",
      observedSymbols: [observedSymbol("ETH/USDT")],
    });

    expect(catalog).toEqual([]);
  });

  it("orders Live entries deterministically independent of source order", () => {
    const left = buildMarketCatalog({
      configuredSymbols: ["XRPUSDT", "BTCUSDT"],
      mode: "live",
      observedSymbols: [observedSymbol("ETHUSDT"), observedSymbol("ADAUSDT")],
    });
    const right = buildMarketCatalog({
      configuredSymbols: ["BTCUSDT", "XRPUSDT"],
      mode: "live",
      observedSymbols: [observedSymbol("ADAUSDT"), observedSymbol("ETHUSDT")],
    });

    expect(marketCatalogSymbols(left)).toEqual([
      "ADAUSDT",
      "BTCUSDT",
      "ETHUSDT",
      "XRPUSDT",
    ]);
    expect(marketCatalogSymbols(right)).toEqual(marketCatalogSymbols(left));
  });
});

describe("catalog status semantics", () => {
  it("keeps an observed Demo market out of the placeholder state", () => {
    const symbols = marketCatalogDashboardSymbols(
      buildMarketCatalog({
        configuredSymbols: [],
        mode: "demo",
        observedSymbols: [observedSymbol("BTCUSDT")],
      }),
    );
    const bitcoin = symbols.find((entry) => entry.symbol === "BTCUSDT");
    const ethereum = symbols.find((entry) => entry.symbol === "ETHUSDT");

    expect(bitcoin).toBeDefined();
    expect(getMarketCatalogAvailability(bitcoin!)).toBe("demo");
    expect(isDashboardSymbolPlaceholder(bitcoin!)).toBe(false);
    expect(ethereum).toBeDefined();
    expect(isDashboardSymbolPlaceholder(ethereum!)).toBe(true);
  });

  it("keeps configured-unobserved Live markets explicit placeholders", () => {
    const symbols = marketCatalogDashboardSymbols(
      buildMarketCatalog({
        configuredSymbols: ["LIVEONLY"],
        mode: "live",
        observedSymbols: [],
      }),
    );

    expect(symbols.map((entry) => entry.symbol)).toEqual(["LIVEONLY"]);
    expect(getMarketCatalogAvailability(symbols[0]!)).toBe(
      "configured-unobserved",
    );
    expect(isDashboardSymbolPlaceholder(symbols[0]!)).toBe(true);
  });
});

describe("catalog identities", () => {
  it("gives the selector different Demo and Live inventories", () => {
    const demoSymbols = marketCatalogSymbols(
      buildMarketCatalog({
        configuredSymbols: ["LIVEONLY"],
        mode: "demo",
        observedSymbols: [],
      }),
    );
    const liveSymbols = marketCatalogSymbols(
      buildMarketCatalog({
        configuredSymbols: ["LIVEONLY"],
        mode: "live",
        observedSymbols: [],
      }),
    );

    expect(demoSymbols).toEqual([...DEMO_MARKETS]);
    expect(liveSymbols).toEqual(["LIVEONLY"]);
  });

  it("treats a Demo-only route as unknown in Live", () => {
    const liveCatalog = buildMarketCatalog({
      configuredSymbols: ["BTCUSDT"],
      mode: "live",
      observedSymbols: [],
    });

    expect(findMarketCatalogEntry(liveCatalog, "dogeusdt")).toBeNull();
  });

  it("treats a configured-unobserved Live route as known without observed data", () => {
    const liveCatalog = buildMarketCatalog({
      configuredSymbols: [" ethusdt "],
      mode: "live",
      observedSymbols: [],
    });
    const entry = findMarketCatalogEntry(liveCatalog, "ETHUSDT");

    expect(entry?.availability).toBe("configured-unobserved");
    expect(entry?.summary.state).toBeNull();
    expect(entry?.summary.health).toBeNull();
  });

  it("preserves the canonical P1-MP01 route identity", () => {
    expect(parseSymbolId("  btCuSdT ")).toBe("BTCUSDT");
    expect(
      findMarketCatalogEntry(
        buildMarketCatalog({
          configuredSymbols: ["BTCUSDT"],
          mode: "live",
          observedSymbols: [],
        }),
        "  btCuSdT ",
      )?.symbol,
    ).toBe("BTCUSDT");
  });
});

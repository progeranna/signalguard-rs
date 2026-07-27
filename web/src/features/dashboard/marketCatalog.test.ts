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

function summary(symbol: string, source: "demo" | "live", availability: DashboardSymbolSummary["availability"] = "observed"): DashboardSymbolSummary {
  return { source, availability, symbol, state: availability === "observed" ? {
    last_trade_price: "100", best_bid_price: "99", best_ask_price: "101", spread_pct: 0.2,
    price_change_1m_pct: 0.1, trades_per_minute: 4, last_event_time: "2026-07-17T10:00:00.000Z",
    last_event_age_ms: 1_000, depth_sequence_gap_count: 0,
  } : null, health: availability === "observed" ? {
    score: 100, status: "healthy", recent_anomaly_count: 0, evaluated_at: "2026-07-17T10:00:00.000Z",
  } : null };
}

describe("explicit market catalog", () => {
  it("preserves Demo order and explicit availability", () => {
    const catalog = buildMarketCatalog({ configuredSymbols: [], mode: "demo", observedSymbols: [summary("BTCUSDT", "demo")] });
    expect(marketCatalogSymbols(catalog)).toEqual([...DEMO_MARKETS]);
    expect(getMarketCatalogAvailability(catalog[0]!.summary)).toBe("observed");
    expect(catalog[1]!.summary.availability).toBe("unavailable");
  });

  it("uses only explicit Live summary entries and sorts canonically", () => {
    const catalog = buildMarketCatalog({ configuredSymbols: ["DOGEUSDT"], mode: "live", observedSymbols: [
      summary("ETHUSDT", "live", "awaiting"), summary("BTCUSDT", "live"), summary("ETHUSDT", "live", "awaiting"),
    ] });
    expect(marketCatalogSymbols(catalog)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(catalog[1]!.availability).toBe("awaiting");
    expect(findMarketCatalogEntry(catalog, "DOGEUSDT")).toBeNull();
  });

  it("keeps non-observed entries metric-free", () => {
    const entry = summary("ETHUSDT", "live", "configured");
    expect(isDashboardSymbolPlaceholder(entry)).toBe(true);
    expect(entry.state).toBeNull();
    expect(entry.health).toBeNull();
    expect(marketCatalogDashboardSymbols([{ availability: "configured", summary: entry, symbol: parseSymbolId("ETHUSDT")! }])[0]).toEqual(entry);
  });
});

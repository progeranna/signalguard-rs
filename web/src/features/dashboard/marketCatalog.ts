import { parseSymbolId, type SymbolId } from "./symbolId";
import type {
  DashboardSymbolSummary,
  UiMode,
} from "./types";

export const DEMO_MARKETS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "ADAUSDT",
  "DOGEUSDT",
] as const;

export type MarketCatalogAvailability =
  | "observed"
  | "configured"
  | "awaiting"
  | "unavailable";

export type MarketCatalogEntry = {
  availability: MarketCatalogAvailability;
  summary: DashboardSymbolSummary;
  symbol: SymbolId;
};

export function buildMarketCatalog({
  configuredSymbols,
  mode,
  observedSymbols,
}: {
  configuredSymbols: readonly string[];
  mode: UiMode;
  observedSymbols: readonly DashboardSymbolSummary[];
}): MarketCatalogEntry[] {
  const summaries = collectObservedSymbols(observedSymbols, mode);

  if (mode === "demo") {
    return DEMO_MARKETS.map((market) => {
      const symbol = parseSymbolId(market);

      if (!symbol) {
        throw new TypeError(`invalid canonical Demo market: ${market}`);
      }

      return {
        availability: summaries.get(symbol)?.availability ?? "unavailable",
        summary: summaries.get(symbol) ?? emptyDashboardSymbol(symbol, mode),
        symbol,
      };
    });
  }

  void configuredSymbols;
  return [...summaries.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((symbol) => {
      const summary = summaries.get(symbol);

      return {
        availability: summary?.availability ?? "unavailable",
        summary: summary ?? emptyDashboardSymbol(symbol, mode),
        symbol,
      };
    });
}

export function marketCatalogSymbols(catalog: readonly MarketCatalogEntry[]): string[] {
  return catalog.map((entry) => entry.symbol);
}

export function marketCatalogDashboardSymbols(
  catalog: readonly MarketCatalogEntry[],
): DashboardSymbolSummary[] {
  return catalog.map((entry) => ({ ...entry.summary, symbol: entry.symbol }));
}

export function findMarketCatalogEntry(
  catalog: readonly MarketCatalogEntry[],
  symbol: string | null | undefined,
): MarketCatalogEntry | null {
  const symbolId = parseSymbolId(symbol);

  if (!symbolId) {
    return null;
  }

  return catalog.find((entry) => entry.symbol === symbolId) ?? null;
}

export function getMarketCatalogAvailability(
  symbol: DashboardSymbolSummary,
): MarketCatalogAvailability | null {
  return symbol.availability;
}

function collectObservedSymbols(
  symbols: readonly DashboardSymbolSummary[],
  mode: UiMode,
): Map<SymbolId, DashboardSymbolSummary> {
  const result = new Map<SymbolId, DashboardSymbolSummary>();

  for (const summary of symbols) {
    const symbol = parseSymbolId(summary.symbol);

    if (!symbol || result.has(symbol)) {
      continue;
    }

    if (summary.source !== mode) {
      throw new TypeError(`catalog symbol source mismatch: expected ${mode}, received ${summary.source}`);
    }
    result.set(symbol, {
      ...summary,
      symbol,
    });
  }

  return result;
}

function emptyDashboardSymbol(symbol: SymbolId, mode: UiMode): DashboardSymbolSummary {
  return {
    source: mode,
    availability: "unavailable",
    symbol,
    state: null,
    health: null,
  };
}

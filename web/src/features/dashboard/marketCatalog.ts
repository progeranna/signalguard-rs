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
  | "demo"
  | "observed"
  | "configured-unobserved";

export type MarketCatalogEntry = {
  availability: MarketCatalogAvailability;
  summary: DashboardSymbolSummary;
  symbol: SymbolId;
};

type MarketCatalogDashboardSymbol = DashboardSymbolSummary & {
  catalogAvailability: MarketCatalogAvailability;
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
  const observedBySymbol = collectObservedSymbols(observedSymbols);

  if (mode === "demo") {
    return DEMO_MARKETS.map((market) => {
      const symbol = parseSymbolId(market);

      if (!symbol) {
        throw new TypeError(`invalid canonical Demo market: ${market}`);
      }

      return {
        availability: "demo" as const,
        summary: observedBySymbol.get(symbol) ?? emptyDashboardSymbol(symbol),
        symbol,
      };
    });
  }

  const configured = collectSymbolIds(configuredSymbols);
  const symbols = new Set([...configured, ...observedBySymbol.keys()]);

  return [...symbols]
    .sort((left, right) => left.localeCompare(right))
    .map((symbol) => {
      const observed = observedBySymbol.get(symbol);

      return {
        availability: observed ? "observed" : "configured-unobserved",
        summary: observed ?? emptyDashboardSymbol(symbol),
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
  return catalog.map<MarketCatalogDashboardSymbol>((entry) => ({
    ...entry.summary,
    catalogAvailability: entry.availability,
    symbol: entry.symbol,
  }));
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
  const availability = (symbol as Partial<MarketCatalogDashboardSymbol>)
    .catalogAvailability;

  return availability === "demo" ||
    availability === "observed" ||
    availability === "configured-unobserved"
    ? availability
    : null;
}

export function isMarketCatalogSymbolList(
  symbols: DashboardSymbolSummary[],
): boolean {
  return symbols.length === 0 || symbols.every(
    (symbol) => getMarketCatalogAvailability(symbol) !== null,
  );
}

function collectSymbolIds(symbols: readonly string[]): Set<SymbolId> {
  const result = new Set<SymbolId>();

  for (const symbol of symbols) {
    const symbolId = parseSymbolId(symbol);

    if (symbolId) {
      result.add(symbolId);
    }
  }

  return result;
}

function collectObservedSymbols(
  symbols: readonly DashboardSymbolSummary[],
): Map<SymbolId, DashboardSymbolSummary> {
  const result = new Map<SymbolId, DashboardSymbolSummary>();

  for (const summary of symbols) {
    const symbol = parseSymbolId(summary.symbol);

    if (!symbol || result.has(symbol)) {
      continue;
    }

    result.set(symbol, {
      ...summary,
      symbol,
    });
  }

  return result;
}

function emptyDashboardSymbol(symbol: SymbolId): DashboardSymbolSummary {
  return {
    symbol,
    state: null,
    health: null,
  };
}

import { parseSymbolId } from "./symbolId";
import type { DashboardSymbolSummary } from "./types";

export const DEMO_MARKETS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "BNBUSDT",
  "ADAUSDT",
  "DOGEUSDT",
] as const;

const demoMarketIndex = new Map(
  DEMO_MARKETS.map((market, index) => [parseSymbolId(market) ?? market, index]),
);

export function orderMarkets(markets: string[]): string[] {
  const knownMarkets = [...DEMO_MARKETS];
  const seenMarkets = new Set(
    knownMarkets.map((market) => parseSymbolId(market) ?? market),
  );

  const extraMarkets: string[] = [];

  for (const market of markets) {
    const normalizedMarket = parseSymbolId(market);

    if (!normalizedMarket || seenMarkets.has(normalizedMarket)) {
      continue;
    }

    seenMarkets.add(normalizedMarket);
    extraMarkets.push(normalizedMarket);
  }

  return [...knownMarkets, ...extraMarkets];
}

export function orderMarketEntries<T>(
  entries: T[],
  getMarket: (entry: T) => string,
): T[] {
  const knownEntries: Array<{ entry: T; index: number }> = [];
  const extraEntries: T[] = [];

  for (const entry of entries) {
    const normalizedMarket = parseSymbolId(getMarket(entry));
    const knownIndex =
      normalizedMarket !== null ? demoMarketIndex.get(normalizedMarket) : undefined;

    if (knownIndex === undefined) {
      extraEntries.push(entry);
      continue;
    }

    knownEntries.push({ entry, index: knownIndex });
  }

  knownEntries.sort((left, right) => left.index - right.index);

  return [...knownEntries.map(({ entry }) => entry), ...extraEntries];
}

export function buildCoveredDashboardSymbols(
  symbols: DashboardSymbolSummary[],
): DashboardSymbolSummary[] {
  return coverCanonicalMarketEntries(
    symbols,
    (symbol) => symbol.symbol,
    (market) => ({
      symbol: market,
      state: null,
      health: null,
    }),
  );
}

export function isDashboardSymbolPlaceholder(
  symbol: DashboardSymbolSummary,
): boolean {
  return symbol.state === null && symbol.health === null;
}

function coverCanonicalMarketEntries<T>(
  entries: T[],
  getMarket: (entry: T) => string,
  createMissingEntry: (market: string) => T,
): T[] {
  const entryByMarket = new Map<string, T>();
  const extraEntries: T[] = [];

  for (const entry of entries) {
    const normalizedMarket = parseSymbolId(getMarket(entry));

    if (!normalizedMarket) {
      extraEntries.push(entry);
      continue;
    }

    if (demoMarketIndex.has(normalizedMarket)) {
      if (!entryByMarket.has(normalizedMarket)) {
        entryByMarket.set(normalizedMarket, entry);
      }

      continue;
    }

    extraEntries.push(entry);
  }

  return [
    ...DEMO_MARKETS.map(
      (market) =>
        entryByMarket.get(parseSymbolId(market) ?? market) ??
        createMissingEntry(market),
    ),
    ...extraEntries,
  ];
}

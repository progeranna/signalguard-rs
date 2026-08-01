import {
  DEMO_MARKETS,
  getMarketCatalogAvailability,
} from "./marketCatalog";
import { parseSymbolId } from "./symbolId";
import type { DashboardSymbolSummary } from "./types";

export { DEMO_MARKETS } from "./marketCatalog";

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

export function isDashboardSymbolPlaceholder(
  symbol: DashboardSymbolSummary,
): boolean {
  const availability = getMarketCatalogAvailability(symbol);

  if (availability === "observed") {
    return false;
  }

  if (availability === "configured" || availability === "awaiting" || availability === "unavailable") {
    return true;
  }

  return symbol.state === null && symbol.health === null;
}

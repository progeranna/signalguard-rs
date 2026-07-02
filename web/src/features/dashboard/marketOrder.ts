import { normalizeSelectedSymbol } from "./selectedSymbol";

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
  DEMO_MARKETS.map((market, index) => [normalizeSelectedSymbol(market) ?? market, index]),
);

export function orderMarkets(markets: string[]): string[] {
  return orderMarketEntries(markets, (market) => market);
}

export function orderMarketEntries<T>(
  entries: T[],
  getMarket: (entry: T) => string,
): T[] {
  const knownEntries: Array<{ entry: T; index: number }> = [];
  const extraEntries: T[] = [];

  for (const entry of entries) {
    const normalizedMarket = normalizeSelectedSymbol(getMarket(entry));
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


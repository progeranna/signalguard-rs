import type { StatusTone } from "@/shared/lib/status";

import type { UiMode } from "./types";
import type { SymbolId } from "./symbolId";

export type MarketDetailViewModel = Readonly<{
  identity: MarketDetailIdentity;
  status: Readonly<{ text: string; tone: StatusTone }>;
  healthScore: string;
  stateAvailable: boolean;
  metrics: Readonly<{
    bestAsk: string;
    bestBid: string;
    depthGaps: string;
    freshness: string;
    lastPrice: string;
    lastEvent: string;
    anomalyCount: string;
    priceMove: string;
    spread: string;
    tradesPerMinute: string;
  }>;
  anomalies: readonly MarketAnomalyViewModel[];
}>;

export type MarketDetailIdentity = Readonly<{ mode: UiMode; symbol: SymbolId }>;

export type MarketAnomalyViewModel = Readonly<{
  id: string;
  symbol: SymbolId;
  type: string;
  severity: Readonly<{ key: "info" | "warning" | "critical"; text: string; tone: StatusTone }>;
  observed: MarketDisplayVariants;
  threshold: MarketDisplayVariants;
  detected: string;
  detectedAt: string;
  context: string;
  valueClassName: string;
}>;

export type MarketDisplayVariants = Readonly<{
  route: string;
  popup: string;
}>;

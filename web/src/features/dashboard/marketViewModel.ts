import type { SymbolId } from "./symbolId";
import type { DashboardAnomaly, UiMode } from "./types";
import type { StatusTone } from "@/shared/lib/status";

export type MarketDisplayVariants = Readonly<{
  popup: string;
  route: string;
}>;

export type MarketAnomalyViewModel = Readonly<{
  detectedAt: MarketDisplayVariants;
  id: string;
  message: MarketDisplayVariants;
  observed: MarketDisplayVariants;
  severity: DashboardAnomaly["severity"];
  severityText: string;
  severityTone: StatusTone;
  symbol: SymbolId;
  threshold: MarketDisplayVariants;
  type: string;
}>;

export type MarketDetailMetricsViewModel = Readonly<{
  anomalyCount: MarketDisplayVariants;
  bestAsk: string;
  bestBid: string;
  depthSequenceGaps: string;
  freshness: MarketDisplayVariants;
  healthScore: string;
  lastEvent: string;
  lastPrice: string;
  priceMoveOneMinute: string;
  spread: string;
  tradesPerMinute: string;
}>;

export type MarketDetailViewModel = Readonly<{
  anomalies: readonly MarketAnomalyViewModel[];
  hasAnomalies: boolean;
  identity: Readonly<{
    mode: UiMode;
    symbol: SymbolId;
  }>;
  metrics: MarketDetailMetricsViewModel;
  status: Readonly<{
    text: string;
    tone: StatusTone;
  }>;
}>;

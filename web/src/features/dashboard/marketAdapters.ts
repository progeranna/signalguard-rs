import {
  formatAgeMs,
  formatCompactNumber,
  formatDecimalString,
  formatPercent,
  formatTimestamp,
} from "@/shared/lib/format";
import { toStatusTone } from "@/shared/lib/status";

import { parseSymbolId, type SymbolId } from "./symbolId";
import type { SymbolMarketResourceData } from "./symbolMarketResource";
import type { DashboardAnomaly, DashboardSymbolSummary } from "./types";
import type {
  MarketAnomalyViewModel,
  MarketDetailIdentity,
  MarketDetailViewModel,
} from "./marketViewModel";

const unavailable = "—";

function display(value: string): string {
  return value === "n/a" ? unavailable : value;
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function availabilityStatus(availability: DashboardSymbolSummary["availability"], health: DashboardSymbolSummary["health"]): string {
  switch (availability) {
    case "configured": return "Configured";
    case "awaiting": return "Awaiting data";
    case "unavailable": return "Unavailable";
    case "observed": return formatStatus(health?.status);
  }
}

function formatAnomalyType(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAnomalyTime(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(date);
}

function formatAnomalyValue(type: string, value: number | null, role: "observed" | "threshold"): string {
  if (value === null || Number.isNaN(value)) return unavailable;
  switch (type) {
    case "spread_spike":
    case "price_move": return `${value.toFixed(3)}%`;
    case "event_lag_spike":
    case "stale_data":
    case "quote_stuck": return value >= 1_000 ? `${(value / 1_000).toFixed(1)} s` : `${formatNumber(value)} ms`;
    case "trade_burst": return `${formatInteger(value)} /m`;
    case "depth_sequence_gap": return `${formatInteger(value)} ${role === "threshold" ? "limit" : "gap"}`;
    default: return formatNumber(value);
  }
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

function anomalyViewModel(anomaly: DashboardAnomaly, symbol: SymbolId): MarketAnomalyViewModel {
  const anomalySymbol = parseSymbolId(anomaly.symbol);
  if (!anomalySymbol || anomalySymbol !== symbol) {
    throw new TypeError(`anomaly view-model symbol mismatch: expected ${symbol}, received ${anomaly.symbol}`);
  }
  return {
    id: anomaly.id,
    symbol: anomalySymbol,
    type: formatAnomalyType(anomaly.anomaly_type),
    severity: { key: anomaly.severity, text: formatStatus(anomaly.severity), tone: toStatusTone(anomaly.severity, "neutral") },
    observed: formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed"),
    threshold: formatAnomalyValue(anomaly.anomaly_type, anomaly.threshold_value, "threshold"),
    detected: formatAnomalyTime(anomaly.event_time || anomaly.created_at),
    detectedAt: display(formatTimestamp(anomaly.event_time)),
    context: anomaly.message || unavailable,
    valueClassName: anomalyValueClass(anomaly.severity),
  };
}

function metricSummary(resource: SymbolMarketResourceData): DashboardSymbolSummary {
  return resource.summary;
}

function anomalyValueClass(severity: DashboardAnomaly["severity"]): string {
  switch (severity) {
    case "critical": return "text-rose-300";
    case "warning": return "text-amber-300";
    case "info": return "text-sky-200";
  }
}

export function adaptMarketResourceToViewModel(
  resource: SymbolMarketResourceData,
  expectedIdentity?: MarketDetailIdentity,
): MarketDetailViewModel {
  const summary = metricSummary(resource);
  if (resource.mode !== "demo" && resource.mode !== "live") {
    throw new TypeError(`market view-model mode mismatch: received ${resource.mode}`);
  }
  if (expectedIdentity && expectedIdentity.mode !== resource.mode) {
    throw new TypeError(`market view-model mode mismatch: expected ${expectedIdentity.mode}, received ${resource.mode}`);
  }
  if (expectedIdentity && expectedIdentity.symbol !== resource.symbol) {
    throw new TypeError(`market view-model symbol mismatch: expected ${expectedIdentity.symbol}, received ${resource.symbol}`);
  }
  if (summary.symbol !== resource.symbol) {
    throw new TypeError(`market view-model symbol mismatch: expected ${resource.symbol}, received ${summary.symbol}`);
  }
  if (summary.source !== resource.mode) {
    throw new TypeError(`market view-model source mismatch: expected ${resource.mode}, received ${summary.source}`);
  }
  for (const anomaly of resource.anomalies) {
    if (anomaly.symbol !== resource.symbol) {
      throw new TypeError(`anomaly view-model symbol mismatch: expected ${resource.symbol}, received ${anomaly.symbol}`);
    }
  }

  const state = summary.state;
  const health = summary.health;
  const statusText = availabilityStatus(summary.availability, health);
  return {
    identity: { mode: resource.mode, symbol: resource.symbol },
    source: summary.source,
    availability: summary.availability,
    status: { text: statusText, tone: toStatusTone(health?.status, "neutral") },
    healthScore: health?.score == null ? unavailable : `${health.score}`,
    stateAvailable: summary.availability === "observed" && state !== null,
    metrics: {
      bestAsk: display(formatDecimalString(state?.best_ask_price)),
      bestBid: display(formatDecimalString(state?.best_bid_price)),
      depthGaps: state ? formatCount(state.depth_sequence_gap_count) : unavailable,
      freshness: display(formatAgeMs(state?.last_event_age_ms)),
      lastPrice: display(formatDecimalString(state?.last_trade_price)),
      lastEvent: display(formatTimestamp(state?.last_event_time)),
      anomalyCount: summary.availability === "observed"
        ? formatCompactNumber(resource.anomalies.length)
        : unavailable,
      priceMove: display(formatPercent(state?.price_change_1m_pct)),
      spread: display(formatPercent(state?.spread_pct)),
      tradesPerMinute: display(formatCompactNumber(state?.trades_per_minute)),
    },
    anomalies: summary.availability === "observed"
      ? resource.anomalies.map((anomaly) => anomalyViewModel(anomaly, resource.symbol))
      : [],
  };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

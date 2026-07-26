import {
  formatAgeMs,
  formatCompactNumber,
  formatDecimalString,
  formatPercent,
  formatTimestamp,
} from "@/shared/lib/format";
import { toStatusTone } from "@/shared/lib/status";

import type { SymbolId } from "./symbolId";
import type { SymbolMarketResourceData } from "./symbolMarketResource";
import type { DashboardAnomaly, UiMode } from "./types";
import type {
  MarketAnomalyViewModel,
  MarketDetailViewModel,
  MarketDisplayVariants,
} from "./marketViewModel";

export type MarketDetailExpectedIdentity = Readonly<{
  mode: UiMode;
  symbol: SymbolId;
}>;

const MISSING_VALUE = "—";
const UNAVAILABLE_VALUE = "Unavailable";

export function adaptMarketDetailResource(
  expectedIdentity: MarketDetailExpectedIdentity,
  resource: SymbolMarketResourceData,
): MarketDetailViewModel {
  assertIdentity(expectedIdentity, resource);

  const state = resource.summary.state;
  const health = resource.summary.health;
  const statusValue = health?.status;
  const anomalies = resource.anomalies.map((anomaly) =>
    adaptMarketAnomaly(expectedIdentity.symbol, anomaly),
  );

  return {
    anomalies,
    hasAnomalies: anomalies.length > 0,
    hasState: state !== null && state !== undefined,
    identity: expectedIdentity,
    metrics: {
      anomalyCount: variants(
        formatCount(anomalies.length),
        formatCompactNumber(anomalies.length),
      ),
      bestAsk: displayDecimal(state?.best_ask_price),
      bestBid: displayDecimal(state?.best_bid_price),
      depthSequenceGaps: displayCount(state?.depth_sequence_gap_count),
      freshness: variants(
        displayAge(state?.last_event_age_ms, MISSING_VALUE),
        displayAge(state?.last_event_age_ms, UNAVAILABLE_VALUE),
      ),
      healthScore: displayNumber(health?.score),
      lastEvent: displayTimestamp(state?.last_event_time),
      lastPrice: displayDecimal(state?.last_trade_price),
      priceMoveOneMinute: displayPercent(state?.price_change_1m_pct),
      spread: displayPercent(state?.spread_pct),
      tradesPerMinute: displayCompact(state?.trades_per_minute),
    },
    status: {
      text: formatStatusLabel(statusValue),
      tone: toStatusTone(statusValue, "neutral"),
    },
  };
}

function assertIdentity(
  expected: MarketDetailExpectedIdentity,
  resource: SymbolMarketResourceData,
): void {
  if (resource.mode !== expected.mode || resource.symbol !== expected.symbol) {
    throw new TypeError(
      `market detail resource identity mismatch: expected ${expected.mode}/${expected.symbol}, received ${resource.mode}/${resource.symbol}`,
    );
  }

  if (resource.summary.symbol !== expected.symbol) {
    throw new TypeError(
      `market detail summary symbol mismatch: expected ${expected.symbol}, received ${resource.summary.symbol}`,
    );
  }
}

function adaptMarketAnomaly(
  expectedSymbol: SymbolId,
  anomaly: DashboardAnomaly,
): MarketAnomalyViewModel {
  if (anomaly.symbol !== expectedSymbol) {
    throw new TypeError(
      `market detail anomaly symbol mismatch: expected ${expectedSymbol}, received ${anomaly.symbol}`,
    );
  }

  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return {
    detectedAt: variants(
      displayTimestamp(anomaly.event_time),
      formatPopupAnomalyTime(anomaly.event_time || anomaly.created_at),
    ),
    id: anomaly.id,
    message: variants(anomaly.message, anomaly.message || MISSING_VALUE),
    observed: variants(
      formatObservation(anomaly.observed_value),
      formatPopupAnomalyValue(
        anomaly.anomaly_type,
        anomaly.observed_value,
        "observed",
      ),
    ),
    severity: anomaly.severity,
    severityText: formatStatusLabel(anomaly.severity),
    severityTone,
    symbol: expectedSymbol,
    threshold: variants(
      formatObservation(anomaly.threshold_value),
      formatPopupAnomalyValue(
        anomaly.anomaly_type,
        anomaly.threshold_value,
        "threshold",
      ),
    ),
    type: formatStatusLabel(anomaly.anomaly_type),
  };
}

function variants(route: string, popup: string): MarketDisplayVariants {
  return { popup, route };
}

function displayDecimal(value: string | null | undefined): string {
  const formatted = formatDecimalString(value);
  return formatted === "n/a" ? MISSING_VALUE : formatted;
}

function displayPercent(value: number | null | undefined): string {
  const formatted = formatPercent(value);
  return formatted === "n/a" ? MISSING_VALUE : formatted;
}

function displayCompact(value: number | null | undefined): string {
  const formatted = formatCompactNumber(value);
  return formatted === "n/a" ? MISSING_VALUE : formatted;
}

function displayAge(
  value: number | null | undefined,
  missingValue: string,
): string {
  const formatted = formatAgeMs(value);
  return formatted === "n/a" ? missingValue : formatted;
}

function displayTimestamp(value: string | null | undefined): string {
  const formatted = formatTimestamp(value);
  return formatted === "n/a" ? MISSING_VALUE : formatted;
}

function displayNumber(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? MISSING_VALUE
    : `${value}`;
}

function displayCount(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? MISSING_VALUE
    : formatCount(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatObservation(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return MISSING_VALUE;
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatStatusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatPopupAnomalyTime(value: string | null | undefined): string {
  if (!value) {
    return UNAVAILABLE_VALUE;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatPopupAnomalyValue(
  type: string,
  value: number | null | undefined,
  role: "observed" | "threshold",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return MISSING_VALUE;
  }

  switch (type) {
    case "spread_spike":
    case "price_move":
      return `${value.toFixed(3)}%`;
    case "event_lag_spike":
    case "stale_data":
    case "quote_stuck":
      return formatDurationValue(value);
    case "trade_burst":
      return `${formatIntegerValue(value)} /m`;
    case "depth_sequence_gap":
      return `${formatIntegerValue(value)} ${role === "threshold" ? "limit" : "gap"}`;
    default:
      return formatNumericValue(value);
  }
}

function formatDurationValue(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} s`;
  }

  return `${formatNumericValue(value)} ms`;
}

function formatIntegerValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

import type { StatusTone } from "@/shared/lib/status";

export type StatusDescriptor<Key extends string> = Readonly<{
  key: Key;
  label: string;
  tone: StatusTone;
  description: string;
}>;

export type SystemStatusKey =
  | "healthy"
  | "degraded"
  | "critical"
  | "offline"
  | "unknown";

export type MarketStatusKey =
  | "healthy"
  | "degraded"
  | "critical"
  | "stale"
  | "no_data";

export type AnomalySeverityKey = "info" | "warning" | "critical";
export type DataAgeKey = "fresh" | "delayed" | "stale" | "no_data";

export type DataAgeInput = Readonly<{
  ageMs: number | null;
  delayedAfterMs: number;
  staleAfterMs: number;
}>;

export type TooltipFactValue = string | number;

export type TooltipFact = Readonly<{
  label: string;
  value: TooltipFactValue;
}>;

export const systemStatusDescriptors = {
  healthy: {
    key: "healthy",
    label: "System Healthy",
    tone: "healthy",
    description: "All monitored system signals are operating normally.",
  },
  degraded: {
    key: "degraded",
    label: "System Degraded",
    tone: "degraded",
    description: "One or more system signals require attention.",
  },
  critical: {
    key: "critical",
    label: "System Critical",
    tone: "critical",
    description: "A critical system condition requires immediate attention.",
  },
  offline: {
    key: "offline",
    label: "System Offline",
    tone: "neutral",
    description: "The system is not currently reporting.",
  },
  unknown: {
    key: "unknown",
    label: "System Unknown",
    tone: "neutral",
    description: "The system status cannot be determined from available data.",
  },
} as const satisfies Readonly<Record<SystemStatusKey, StatusDescriptor<SystemStatusKey>>>;

export const marketStatusDescriptors = {
  healthy: {
    key: "healthy",
    label: "Market Healthy",
    tone: "healthy",
    description: "The market is available, fresh, and within healthy limits.",
  },
  degraded: {
    key: "degraded",
    label: "Market Degraded",
    tone: "degraded",
    description: "The market is available but one or more health signals require attention.",
  },
  critical: {
    key: "critical",
    label: "Market Critical",
    tone: "critical",
    description: "The market has a critical health condition requiring immediate attention.",
  },
  stale: {
    key: "stale",
    label: "Market Stale",
    tone: "critical",
    description: "The market is available but its latest data is stale.",
  },
  no_data: {
    key: "no_data",
    label: "Market No Data",
    tone: "neutral",
    description: "No market data is currently available.",
  },
} as const satisfies Readonly<Record<MarketStatusKey, StatusDescriptor<MarketStatusKey>>>;

export const anomalySeverityDescriptors = {
  info: {
    key: "info",
    label: "Info",
    tone: "info",
    description: "An informational anomaly has been detected.",
  },
  warning: {
    key: "warning",
    label: "Warning",
    tone: "warning",
    description: "An anomaly requires attention.",
  },
  critical: {
    key: "critical",
    label: "Critical",
    tone: "critical",
    description: "A critical anomaly requires immediate attention.",
  },
} as const satisfies Readonly<
  Record<AnomalySeverityKey, StatusDescriptor<AnomalySeverityKey>>
>;

export const noActiveAnomaliesDescriptor = {
  key: "none",
  label: "No Active Anomalies",
  tone: "neutral",
  description: "No active anomalies are currently reported.",
} as const satisfies StatusDescriptor<"none">;

export const dataAgeDescriptors = {
  fresh: {
    key: "fresh",
    label: "Fresh",
    tone: "healthy",
    description: "The latest data is within the fresh-data threshold.",
  },
  delayed: {
    key: "delayed",
    label: "Delayed",
    tone: "degraded",
    description: "The latest data is delayed but has not reached the stale threshold.",
  },
  stale: {
    key: "stale",
    label: "Stale",
    tone: "critical",
    description: "The latest data has reached or exceeded the stale threshold.",
  },
  no_data: {
    key: "no_data",
    label: "No Data",
    tone: "neutral",
    description: "No data-age value is available.",
  },
} as const satisfies Readonly<Record<DataAgeKey, StatusDescriptor<DataAgeKey>>>;

export const detectorLabels = {
  price_move: "Price Move",
  spread_spike: "Spread Spike",
  stale_data: "Stale Data",
  trade_burst: "Trade Burst",
  quote_stuck: "Quote Stuck",
  event_lag_spike: "Event Lag Spike",
  depth_sequence_gap: "Depth Sequence Gap",
} as const;

export type KnownDetectorKey = keyof typeof detectorLabels;

export const timeFactLabels = {
  last_evaluated: "Last evaluated",
  last_event: "Last event",
  detected: "Detected",
} as const;

export type TimeFactKey = keyof typeof timeFactLabels;
export type TimeFactLabel = (typeof timeFactLabels)[TimeFactKey];

export function getSystemStatusDescriptor(
  key: SystemStatusKey,
): StatusDescriptor<SystemStatusKey> {
  return systemStatusDescriptors[key];
}

export function getMarketStatusDescriptor(
  key: MarketStatusKey,
): StatusDescriptor<MarketStatusKey> {
  return marketStatusDescriptors[key];
}

export function getAnomalySeverityDescriptor(
  key: AnomalySeverityKey,
): StatusDescriptor<AnomalySeverityKey> {
  return anomalySeverityDescriptors[key];
}

export function classifyDataAge({
  ageMs,
  delayedAfterMs,
  staleAfterMs,
}: DataAgeInput): DataAgeKey {
  assertFiniteNonNegative(delayedAfterMs, "delayedAfterMs");
  assertFiniteNonNegative(staleAfterMs, "staleAfterMs");

  if (delayedAfterMs > staleAfterMs) {
    throw new RangeError("delayedAfterMs must be less than or equal to staleAfterMs");
  }

  if (ageMs === null) {
    return "no_data";
  }

  assertFiniteNonNegative(ageMs, "ageMs");

  if (ageMs < delayedAfterMs) {
    return "fresh";
  }

  if (ageMs < staleAfterMs) {
    return "delayed";
  }

  return "stale";
}

export function getDataAgeDescriptor(input: DataAgeInput): StatusDescriptor<DataAgeKey> {
  return dataAgeDescriptors[classifyDataAge(input)];
}

export function formatDetectorLabel(detectorKey: string): string {
  if (isKnownDetectorKey(detectorKey)) {
    return detectorLabels[detectorKey];
  }

  const formatted = detectorKey
    .split("_")
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  return formatted || "Unknown Detector";
}

export function formatActiveAnomalyLabel(
  severity: AnomalySeverityKey,
  detectorKey: string,
): string {
  return `${anomalySeverityDescriptors[severity].label} · ${formatDetectorLabel(detectorKey)}`;
}

export function createTooltipFact(
  label: string,
  value: TooltipFactValue | null | undefined,
): TooltipFact | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return { label, value };
}

export function createTimeFact(
  key: TimeFactKey,
  value: TooltipFactValue | null | undefined,
): TooltipFact | null {
  return createTooltipFact(timeFactLabels[key], value);
}

function isKnownDetectorKey(detectorKey: string): detectorKey is KnownDetectorKey {
  return Object.prototype.hasOwnProperty.call(detectorLabels, detectorKey);
}

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }

  if (value < 0) {
    throw new RangeError(`${name} must be non-negative`);
  }
}

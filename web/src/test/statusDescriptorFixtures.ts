import type {
  AnomalySeverityKey,
  DataAgeInput,
  DataAgeKey,
  MarketStatusKey,
  SystemStatusKey,
  TimeFactKey,
  TooltipFactValue,
} from "@/features/dashboard/statusDescriptors";
import type { StatusTone } from "@/shared/lib/status";

export type SemanticDescriptorExpectation<Key extends string> = Readonly<{
  key: Key;
  label: string;
  tone: StatusTone;
  description: string;
}>;

export type SystemStatusFixture = Readonly<{
  id: string;
  input: Readonly<{ key: SystemStatusKey }>;
  expected: SemanticDescriptorExpectation<SystemStatusKey>;
}>;

export type MarketStatusFixture = Readonly<{
  id: string;
  input: Readonly<{ key: MarketStatusKey }>;
  expected: SemanticDescriptorExpectation<MarketStatusKey>;
}>;

export type AnomalySeverityFixture = Readonly<{
  id: string;
  input: Readonly<{
    severity: AnomalySeverityKey;
    detectorKey: string;
  }>;
  expected: Readonly<{
    severity: SemanticDescriptorExpectation<AnomalySeverityKey>;
    detectorLabel: string;
    activeLabel: string;
  }>;
}>;

export type NoActiveAnomaliesFixture = Readonly<{
  id: string;
  expected: SemanticDescriptorExpectation<"none">;
}>;

export type DetectorLabelFixture = Readonly<{
  id: string;
  input: Readonly<{ detectorKey: string }>;
  expectedLabel: string;
  known: boolean;
}>;

export type ValidDataAgeFixture = Readonly<{
  id: string;
  input: DataAgeInput;
  expected: Readonly<{
    key: DataAgeKey;
    descriptor: SemanticDescriptorExpectation<DataAgeKey>;
  }>;
}>;

export type InvalidDataAgeErrorName = "RangeError" | "TypeError";

export type InvalidDataAgeFixture = Readonly<{
  id: string;
  input: DataAgeInput;
  expectedError: Readonly<{
    name: InvalidDataAgeErrorName;
    message: string;
  }>;
}>;

export type TooltipFactFixture = Readonly<{
  id: string;
  input: Readonly<{
    label: string;
    value: TooltipFactValue | null | undefined;
  }>;
  expected: Readonly<{ label: string; value: TooltipFactValue }> | null;
}>;

export type TimeFactFixture = Readonly<{
  id: string;
  input: Readonly<{
    key: TimeFactKey;
    value: TooltipFactValue | null | undefined;
  }>;
  expected: Readonly<{ label: string; value: TooltipFactValue }> | null;
}>;

export const SYSTEM_STATUS_FIXTURES = [
  {
    id: "system-status-healthy",
    input: { key: "healthy" },
    expected: {
      key: "healthy",
      label: "System Healthy",
      tone: "healthy",
      description: "All monitored system signals are operating normally.",
    },
  },
  {
    id: "system-status-degraded",
    input: { key: "degraded" },
    expected: {
      key: "degraded",
      label: "System Degraded",
      tone: "degraded",
      description: "One or more system signals require attention.",
    },
  },
  {
    id: "system-status-critical",
    input: { key: "critical" },
    expected: {
      key: "critical",
      label: "System Critical",
      tone: "critical",
      description: "A critical system condition requires immediate attention.",
    },
  },
  {
    id: "system-status-offline",
    input: { key: "offline" },
    expected: {
      key: "offline",
      label: "System Offline",
      tone: "neutral",
      description: "The system is not currently reporting.",
    },
  },
  {
    id: "system-status-unknown",
    input: { key: "unknown" },
    expected: {
      key: "unknown",
      label: "System Unknown",
      tone: "neutral",
      description: "The system status cannot be determined from available data.",
    },
  },
] as const satisfies readonly SystemStatusFixture[];

export const MARKET_STATUS_FIXTURES = [
  {
    id: "market-status-healthy",
    input: { key: "healthy" },
    expected: {
      key: "healthy",
      label: "Market Healthy",
      tone: "healthy",
      description: "The market is available, fresh, and within healthy limits.",
    },
  },
  {
    id: "market-status-degraded",
    input: { key: "degraded" },
    expected: {
      key: "degraded",
      label: "Market Degraded",
      tone: "degraded",
      description: "The market is available but one or more health signals require attention.",
    },
  },
  {
    id: "market-status-critical",
    input: { key: "critical" },
    expected: {
      key: "critical",
      label: "Market Critical",
      tone: "critical",
      description: "The market has a critical health condition requiring immediate attention.",
    },
  },
  {
    id: "market-status-stale",
    input: { key: "stale" },
    expected: {
      key: "stale",
      label: "Market Stale",
      tone: "critical",
      description: "The market is available but its latest data is stale.",
    },
  },
  {
    id: "market-status-no-data",
    input: { key: "no_data" },
    expected: {
      key: "no_data",
      label: "Market No Data",
      tone: "neutral",
      description: "No market data is currently available.",
    },
  },
] as const satisfies readonly MarketStatusFixture[];

export const ANOMALY_SEVERITY_FIXTURES = [
  {
    id: "anomaly-severity-info-stale-data",
    input: { severity: "info", detectorKey: "stale_data" },
    expected: {
      severity: {
        key: "info",
        label: "Info",
        tone: "info",
        description: "An informational anomaly has been detected.",
      },
      detectorLabel: "Stale Data",
      activeLabel: "Info · Stale Data",
    },
  },
  {
    id: "anomaly-severity-warning-spread-spike",
    input: { severity: "warning", detectorKey: "spread_spike" },
    expected: {
      severity: {
        key: "warning",
        label: "Warning",
        tone: "warning",
        description: "An anomaly requires attention.",
      },
      detectorLabel: "Spread Spike",
      activeLabel: "Warning · Spread Spike",
    },
  },
  {
    id: "anomaly-severity-critical-price-move",
    input: { severity: "critical", detectorKey: "price_move" },
    expected: {
      severity: {
        key: "critical",
        label: "Critical",
        tone: "critical",
        description: "A critical anomaly requires immediate attention.",
      },
      detectorLabel: "Price Move",
      activeLabel: "Critical · Price Move",
    },
  },
] as const satisfies readonly AnomalySeverityFixture[];

export const NO_ACTIVE_ANOMALIES_FIXTURE = {
  id: "anomaly-none-active",
  expected: {
    key: "none",
    label: "No Active Anomalies",
    tone: "neutral",
    description: "No active anomalies are currently reported.",
  },
} as const satisfies NoActiveAnomaliesFixture;

export const DETECTOR_LABEL_FIXTURES = [
  {
    id: "detector-known-price-move",
    input: { detectorKey: "price_move" },
    expectedLabel: "Price Move",
    known: true,
  },
  {
    id: "detector-known-spread-spike",
    input: { detectorKey: "spread_spike" },
    expectedLabel: "Spread Spike",
    known: true,
  },
  {
    id: "detector-known-stale-data",
    input: { detectorKey: "stale_data" },
    expectedLabel: "Stale Data",
    known: true,
  },
  {
    id: "detector-known-trade-burst",
    input: { detectorKey: "trade_burst" },
    expectedLabel: "Trade Burst",
    known: true,
  },
  {
    id: "detector-known-quote-stuck",
    input: { detectorKey: "quote_stuck" },
    expectedLabel: "Quote Stuck",
    known: true,
  },
  {
    id: "detector-known-event-lag-spike",
    input: { detectorKey: "event_lag_spike" },
    expectedLabel: "Event Lag Spike",
    known: true,
  },
  {
    id: "detector-known-depth-sequence-gap",
    input: { detectorKey: "depth_sequence_gap" },
    expectedLabel: "Depth Sequence Gap",
    known: true,
  },
  {
    id: "detector-unknown-snake-case",
    input: { detectorKey: "custom_liquidity_gap" },
    expectedLabel: "Custom Liquidity Gap",
    known: false,
  },
  {
    id: "detector-unknown-repeated-underscores",
    input: { detectorKey: "__custom__detector__" },
    expectedLabel: "Custom Detector",
    known: false,
  },
  {
    id: "detector-unknown-empty",
    input: { detectorKey: "" },
    expectedLabel: "Unknown Detector",
    known: false,
  },
] as const satisfies readonly DetectorLabelFixture[];

export const VALID_DATA_AGE_FIXTURES = [
  {
    id: "data-age-no-data-null",
    input: { ageMs: null, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "no_data",
      descriptor: {
        key: "no_data",
        label: "No Data",
        tone: "neutral",
        description: "No data-age value is available.",
      },
    },
  },
  {
    id: "data-age-fresh-zero",
    input: { ageMs: 0, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "fresh",
      descriptor: {
        key: "fresh",
        label: "Fresh",
        tone: "healthy",
        description: "The latest data is within the fresh-data threshold.",
      },
    },
  },
  {
    id: "data-age-fresh-before-delay",
    input: { ageMs: 999, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "fresh",
      descriptor: {
        key: "fresh",
        label: "Fresh",
        tone: "healthy",
        description: "The latest data is within the fresh-data threshold.",
      },
    },
  },
  {
    id: "data-age-delayed-at-boundary",
    input: { ageMs: 1_000, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "delayed",
      descriptor: {
        key: "delayed",
        label: "Delayed",
        tone: "degraded",
        description: "The latest data is delayed but has not reached the stale threshold.",
      },
    },
  },
  {
    id: "data-age-delayed-before-stale",
    input: { ageMs: 4_999, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "delayed",
      descriptor: {
        key: "delayed",
        label: "Delayed",
        tone: "degraded",
        description: "The latest data is delayed but has not reached the stale threshold.",
      },
    },
  },
  {
    id: "data-age-stale-at-boundary",
    input: { ageMs: 5_000, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "stale",
      descriptor: {
        key: "stale",
        label: "Stale",
        tone: "critical",
        description: "The latest data has reached or exceeded the stale threshold.",
      },
    },
  },
  {
    id: "data-age-stale-above-boundary",
    input: { ageMs: 10_000, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expected: {
      key: "stale",
      descriptor: {
        key: "stale",
        label: "Stale",
        tone: "critical",
        description: "The latest data has reached or exceeded the stale threshold.",
      },
    },
  },
  {
    id: "data-age-equal-threshold-stale",
    input: { ageMs: 1_000, delayedAfterMs: 1_000, staleAfterMs: 1_000 },
    expected: {
      key: "stale",
      descriptor: {
        key: "stale",
        label: "Stale",
        tone: "critical",
        description: "The latest data has reached or exceeded the stale threshold.",
      },
    },
  },
] as const satisfies readonly ValidDataAgeFixture[];

export const INVALID_DATA_AGE_FIXTURES = [
  {
    id: "data-age-invalid-negative-age",
    input: { ageMs: -1, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expectedError: { name: "RangeError", message: "ageMs must be non-negative" },
  },
  {
    id: "data-age-invalid-non-finite-age",
    input: { ageMs: Number.POSITIVE_INFINITY, delayedAfterMs: 1_000, staleAfterMs: 5_000 },
    expectedError: { name: "TypeError", message: "ageMs must be a finite number" },
  },
  {
    id: "data-age-invalid-negative-delayed-threshold",
    input: { ageMs: null, delayedAfterMs: -1, staleAfterMs: 5_000 },
    expectedError: { name: "RangeError", message: "delayedAfterMs must be non-negative" },
  },
  {
    id: "data-age-invalid-non-finite-delayed-threshold",
    input: { ageMs: null, delayedAfterMs: Number.NaN, staleAfterMs: 5_000 },
    expectedError: { name: "TypeError", message: "delayedAfterMs must be a finite number" },
  },
  {
    id: "data-age-invalid-negative-stale-threshold",
    input: { ageMs: null, delayedAfterMs: 1_000, staleAfterMs: -1 },
    expectedError: { name: "RangeError", message: "staleAfterMs must be non-negative" },
  },
  {
    id: "data-age-invalid-non-finite-stale-threshold",
    input: { ageMs: null, delayedAfterMs: 1_000, staleAfterMs: Number.NEGATIVE_INFINITY },
    expectedError: { name: "TypeError", message: "staleAfterMs must be a finite number" },
  },
  {
    id: "data-age-invalid-reversed-thresholds",
    input: { ageMs: null, delayedAfterMs: 5_001, staleAfterMs: 5_000 },
    expectedError: {
      name: "RangeError",
      message: "delayedAfterMs must be less than or equal to staleAfterMs",
    },
  },
] as const satisfies readonly InvalidDataAgeFixture[];

export const TOOLTIP_FACT_FIXTURES = [
  {
    id: "tooltip-fact-string",
    input: { label: "Source", value: "Live" },
    expected: { label: "Source", value: "Live" },
  },
  {
    id: "tooltip-fact-zero",
    input: { label: "Count", value: 0 },
    expected: { label: "Count", value: 0 },
  },
  {
    id: "tooltip-fact-explicit-zero-display",
    input: { label: "Data age", value: "0 ms" },
    expected: { label: "Data age", value: "0 ms" },
  },
  {
    id: "tooltip-fact-empty-string",
    input: { label: "Empty", value: "" },
    expected: null,
  },
  {
    id: "tooltip-fact-null",
    input: { label: "Missing", value: null },
    expected: null,
  },
  {
    id: "tooltip-fact-undefined",
    input: { label: "Missing", value: undefined },
    expected: null,
  },
] as const satisfies readonly TooltipFactFixture[];

export const TIME_FACT_FIXTURES = [
  {
    id: "time-fact-last-evaluated",
    input: { key: "last_evaluated", value: "2026-07-20 10:00:00 UTC" },
    expected: { label: "Last evaluated", value: "2026-07-20 10:00:00 UTC" },
  },
  {
    id: "time-fact-last-event-zero",
    input: { key: "last_event", value: 0 },
    expected: { label: "Last event", value: 0 },
  },
  {
    id: "time-fact-detected",
    input: { key: "detected", value: "2026-07-20 10:00:05 UTC" },
    expected: { label: "Detected", value: "2026-07-20 10:00:05 UTC" },
  },
] as const satisfies readonly TimeFactFixture[];

export const STATUS_DESCRIPTOR_FIXTURE_GROUPS = [
  { id: "system-status", fixtures: SYSTEM_STATUS_FIXTURES },
  { id: "market-status", fixtures: MARKET_STATUS_FIXTURES },
  { id: "anomaly-severity", fixtures: ANOMALY_SEVERITY_FIXTURES },
  { id: "no-active-anomalies", fixtures: [NO_ACTIVE_ANOMALIES_FIXTURE] },
  { id: "detector-label", fixtures: DETECTOR_LABEL_FIXTURES },
  { id: "data-age-valid", fixtures: VALID_DATA_AGE_FIXTURES },
  { id: "data-age-invalid", fixtures: INVALID_DATA_AGE_FIXTURES },
  { id: "tooltip-fact", fixtures: TOOLTIP_FACT_FIXTURES },
  { id: "time-fact", fixtures: TIME_FACT_FIXTURES },
] as const;

export const STATUS_DESCRIPTOR_FIXTURE_INVENTORY = [
  ...SYSTEM_STATUS_FIXTURES,
  ...MARKET_STATUS_FIXTURES,
  ...ANOMALY_SEVERITY_FIXTURES,
  NO_ACTIVE_ANOMALIES_FIXTURE,
  ...DETECTOR_LABEL_FIXTURES,
  ...VALID_DATA_AGE_FIXTURES,
  ...INVALID_DATA_AGE_FIXTURES,
  ...TOOLTIP_FACT_FIXTURES,
  ...TIME_FACT_FIXTURES,
] as const;

import { describe, expect, it } from "vitest";

import type { StatusTone } from "@/shared/lib/status";

import {
  anomalySeverityDescriptors,
  classifyDataAge,
  createTimeFact,
  createTooltipFact,
  dataAgeDescriptors,
  detectorLabels,
  formatActiveAnomalyLabel,
  formatDetectorLabel,
  getDataAgeDescriptor,
  getMarketStatusDescriptor,
  getSystemStatusDescriptor,
  marketStatusDescriptors,
  noActiveAnomaliesDescriptor,
  systemStatusDescriptors,
  timeFactLabels,
} from "./statusDescriptors";

const validStatusTones = new Set<StatusTone>([
  "ok",
  "healthy",
  "degraded",
  "unhealthy",
  "info",
  "warning",
  "critical",
  "neutral",
]);

const dataAgeThresholds = {
  delayedAfterMs: 1_000,
  staleAfterMs: 5_000,
} as const;

describe("status descriptor vocabulary", () => {
  it("defines the exact system keys and labels", () => {
    expect(Object.keys(systemStatusDescriptors)).toEqual([
      "healthy",
      "degraded",
      "critical",
      "offline",
      "unknown",
    ]);
    expect(Object.values(systemStatusDescriptors).map(({ key, label }) => [key, label])).toEqual([
      ["healthy", "System Healthy"],
      ["degraded", "System Degraded"],
      ["critical", "System Critical"],
      ["offline", "System Offline"],
      ["unknown", "System Unknown"],
    ]);
  });

  it("defines the exact market keys and labels", () => {
    expect(Object.keys(marketStatusDescriptors)).toEqual([
      "healthy",
      "degraded",
      "critical",
      "stale",
      "no_data",
    ]);
    expect(Object.values(marketStatusDescriptors).map(({ key, label }) => [key, label])).toEqual([
      ["healthy", "Market Healthy"],
      ["degraded", "Market Degraded"],
      ["critical", "Market Critical"],
      ["stale", "Market Stale"],
      ["no_data", "Market No Data"],
    ]);
  });

  it("defines the exact Data Age keys and labels", () => {
    expect(Object.keys(dataAgeDescriptors)).toEqual([
      "fresh",
      "delayed",
      "stale",
      "no_data",
    ]);
    expect(Object.values(dataAgeDescriptors).map(({ key, label }) => [key, label])).toEqual([
      ["fresh", "Fresh"],
      ["delayed", "Delayed"],
      ["stale", "Stale"],
      ["no_data", "No Data"],
    ]);
  });

  it("uses only existing StatusTone values", () => {
    const descriptors = [
      ...Object.values(systemStatusDescriptors),
      ...Object.values(marketStatusDescriptors),
      ...Object.values(anomalySeverityDescriptors),
      ...Object.values(dataAgeDescriptors),
      noActiveAnomaliesDescriptor,
    ];

    for (const descriptor of descriptors) {
      expect(validStatusTones.has(descriptor.tone)).toBe(true);
    }
  });

  it("keeps stale and no-data market semantics distinct", () => {
    expect(getMarketStatusDescriptor("stale")).toMatchObject({
      key: "stale",
      label: "Market Stale",
      tone: "critical",
    });
    expect(getMarketStatusDescriptor("no_data")).toMatchObject({
      key: "no_data",
      label: "Market No Data",
      tone: "neutral",
    });
  });
});

describe("anomaly detector display", () => {
  it("maps every current detector identifier", () => {
    expect(detectorLabels).toEqual({
      price_move: "Price Move",
      spread_spike: "Spread Spike",
      stale_data: "Stale Data",
      trade_burst: "Trade Burst",
      quote_stuck: "Quote Stuck",
      event_lag_spike: "Event Lag Spike",
      depth_sequence_gap: "Depth Sequence Gap",
    });
  });

  it("formats the exact active anomaly examples", () => {
    expect(formatActiveAnomalyLabel("warning", "spread_spike")).toBe(
      "Warning · Spread Spike",
    );
    expect(formatActiveAnomalyLabel("critical", "price_move")).toBe(
      "Critical · Price Move",
    );
    expect(formatActiveAnomalyLabel("info", "stale_data")).toBe("Info · Stale Data");
    expect(noActiveAnomaliesDescriptor.label).toBe("No Active Anomalies");
  });

  it("formats unknown snake_case identifiers deterministically", () => {
    expect(formatDetectorLabel("custom_liquidity_gap")).toBe("Custom Liquidity Gap");
    expect(formatDetectorLabel("custom_liquidity_gap")).toBe(
      formatDetectorLabel("custom_liquidity_gap"),
    );
    expect(formatDetectorLabel("__custom__detector__")).toBe("Custom Detector");
    expect(formatDetectorLabel("")).toBe("Unknown Detector");
    expect(formatDetectorLabel("custom_liquidity_gap")).not.toBe(
      detectorLabels.depth_sequence_gap,
    );
  });
});

describe("Data Age classification", () => {
  it("classifies null, fresh, delayed, stale, and exact boundaries", () => {
    expect(classifyDataAge({ ageMs: null, ...dataAgeThresholds })).toBe("no_data");
    expect(classifyDataAge({ ageMs: 0, ...dataAgeThresholds })).toBe("fresh");
    expect(classifyDataAge({ ageMs: 999, ...dataAgeThresholds })).toBe("fresh");
    expect(classifyDataAge({ ageMs: 1_000, ...dataAgeThresholds })).toBe("delayed");
    expect(classifyDataAge({ ageMs: 4_999, ...dataAgeThresholds })).toBe("delayed");
    expect(classifyDataAge({ ageMs: 5_000, ...dataAgeThresholds })).toBe("stale");
    expect(classifyDataAge({ ageMs: 10_000, ...dataAgeThresholds })).toBe("stale");
  });

  it("supports equal delayed and stale thresholds without correction", () => {
    expect(
      classifyDataAge({ ageMs: 999, delayedAfterMs: 1_000, staleAfterMs: 1_000 }),
    ).toBe("fresh");
    expect(
      classifyDataAge({ ageMs: 1_000, delayedAfterMs: 1_000, staleAfterMs: 1_000 }),
    ).toBe("stale");
  });

  it.each([
    ["negative age", { ageMs: -1, ...dataAgeThresholds }, RangeError, "ageMs must be non-negative"],
    ["non-finite age", { ageMs: Number.POSITIVE_INFINITY, ...dataAgeThresholds }, TypeError, "ageMs must be a finite number"],
    ["negative delayed threshold", { ageMs: null, delayedAfterMs: -1, staleAfterMs: 5_000 }, RangeError, "delayedAfterMs must be non-negative"],
    ["non-finite delayed threshold", { ageMs: null, delayedAfterMs: Number.NaN, staleAfterMs: 5_000 }, TypeError, "delayedAfterMs must be a finite number"],
    ["negative stale threshold", { ageMs: null, delayedAfterMs: 1_000, staleAfterMs: -1 }, RangeError, "staleAfterMs must be non-negative"],
    ["non-finite stale threshold", { ageMs: null, delayedAfterMs: 1_000, staleAfterMs: Number.NEGATIVE_INFINITY }, TypeError, "staleAfterMs must be a finite number"],
    ["reversed thresholds", { ageMs: null, delayedAfterMs: 5_001, staleAfterMs: 5_000 }, RangeError, "delayedAfterMs must be less than or equal to staleAfterMs"],
  ] as const)("rejects %s deterministically", (_name, input, errorType, message) => {
    expect(() => classifyDataAge(input)).toThrow(errorType);
    expect(() => classifyDataAge(input)).toThrow(message);
  });

  it("returns the descriptor for the classified age", () => {
    expect(getDataAgeDescriptor({ ageMs: 1_000, ...dataAgeThresholds })).toBe(
      dataAgeDescriptors.delayed,
    );
  });
});

describe("tooltip facts and deterministic purity", () => {
  it("uses the exact time labels", () => {
    expect(timeFactLabels).toEqual({
      last_evaluated: "Last evaluated",
      last_event: "Last event",
      detected: "Detected",
    });
  });

  it("preserves zero and explicit supplied display values", () => {
    expect(createTooltipFact("Count", 0)).toEqual({ label: "Count", value: 0 });
    expect(createTooltipFact("Value", "0 ms")).toEqual({ label: "Value", value: "0 ms" });
    expect(createTimeFact("last_evaluated", "2026-07-20 10:00:00 UTC")).toEqual({
      label: "Last evaluated",
      value: "2026-07-20 10:00:00 UTC",
    });
    expect(createTimeFact("detected", 0)).toEqual({ label: "Detected", value: 0 });
  });

  it("omits only explicit empty or absent values", () => {
    expect(createTooltipFact("Empty", "")).toBeNull();
    expect(createTooltipFact("Missing", null)).toBeNull();
    expect(createTooltipFact("Missing", undefined)).toBeNull();
    expect(createTooltipFact("Whitespace", " ")).toEqual({ label: "Whitespace", value: " " });
  });

  it("returns equal values for equal inputs without environment dependencies", () => {
    const input = { ageMs: 1_500, ...dataAgeThresholds } as const;

    expect(getSystemStatusDescriptor("healthy")).toEqual(getSystemStatusDescriptor("healthy"));
    expect(getDataAgeDescriptor(input)).toEqual(getDataAgeDescriptor(input));
    expect(formatActiveAnomalyLabel("warning", "spread_spike")).toBe(
      formatActiveAnomalyLabel("warning", "spread_spike"),
    );
    expect(createTimeFact("last_event", "supplied display value")).toEqual(
      createTimeFact("last_event", "supplied display value"),
    );
  });

  it("contains no Replay public-mode or React runtime concept", () => {
    const publicModel = JSON.stringify({
      anomalySeverityDescriptors,
      dataAgeDescriptors,
      detectorLabels,
      marketStatusDescriptors,
      noActiveAnomaliesDescriptor,
      systemStatusDescriptors,
      timeFactLabels,
    });

    expect(publicModel).not.toMatch(/replay/i);
    expect(publicModel).not.toMatch(/react/i);
  });
});

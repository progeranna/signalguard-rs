// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyDataAge,
  createTimeFact,
  createTooltipFact,
  detectorLabels,
  formatActiveAnomalyLabel,
  formatDetectorLabel,
  getAnomalySeverityDescriptor,
  getDataAgeDescriptor,
  getMarketStatusDescriptor,
  getSystemStatusDescriptor,
  noActiveAnomaliesDescriptor,
} from "@/features/dashboard/statusDescriptors";

import {
  ANOMALY_SEVERITY_FIXTURES,
  DETECTOR_LABEL_FIXTURES,
  INVALID_DATA_AGE_FIXTURES,
  MARKET_STATUS_FIXTURES,
  NO_ACTIVE_ANOMALIES_FIXTURE,
  STATUS_DESCRIPTOR_FIXTURE_GROUPS,
  STATUS_DESCRIPTOR_FIXTURE_INVENTORY,
  SYSTEM_STATUS_FIXTURES,
  TIME_FACT_FIXTURES,
  TOOLTIP_FACT_FIXTURES,
  VALID_DATA_AGE_FIXTURES,
  type InvalidDataAgeErrorName,
} from "./statusDescriptorFixtures";

const fixtureSourcePath = path.join(
  process.cwd(),
  "src/test/statusDescriptorFixtures.ts",
);
const fixtureSource = readFileSync(fixtureSourcePath, "utf8");

const expectedSystemKeys = [
  "healthy",
  "degraded",
  "critical",
  "offline",
  "unknown",
] as const;
const expectedMarketKeys = [
  "healthy",
  "degraded",
  "critical",
  "stale",
  "no_data",
] as const;
const expectedSeverityKeys = ["info", "warning", "critical"] as const;
const expectedKnownDetectorKeys = [
  "price_move",
  "spread_spike",
  "stale_data",
  "trade_burst",
  "quote_stuck",
  "event_lag_spike",
  "depth_sequence_gap",
] as const;
const expectedDataAgeKeys = ["fresh", "delayed", "stale", "no_data"] as const;
const expectedTimeKeys = ["last_evaluated", "last_event", "detected"] as const;
const expectedGroupOrder = [
  "system-status",
  "market-status",
  "anomaly-severity",
  "no-active-anomalies",
  "detector-label",
  "data-age-valid",
  "data-age-invalid",
  "tooltip-fact",
  "time-fact",
] as const;
const expectedGroupCounts = [5, 5, 3, 1, 10, 8, 7, 6, 3] as const;
const errorConstructors = {
  RangeError,
  TypeError,
} as const;

describe("semantic descriptor fixture completeness", () => {
  it("covers every system status exactly once with literal expectations", () => {
    expect(SYSTEM_STATUS_FIXTURES.map(({ input }) => input.key)).toEqual(
      expectedSystemKeys,
    );
    expect(new Set(SYSTEM_STATUS_FIXTURES.map(({ input }) => input.key)).size).toBe(
      expectedSystemKeys.length,
    );

    for (const fixture of SYSTEM_STATUS_FIXTURES) {
      expect(getSystemStatusDescriptor(fixture.input.key)).toEqual(fixture.expected);
    }
  });

  it("covers every market status exactly once and keeps stale distinct from no data", () => {
    expect(MARKET_STATUS_FIXTURES.map(({ input }) => input.key)).toEqual(
      expectedMarketKeys,
    );
    expect(new Set(MARKET_STATUS_FIXTURES.map(({ input }) => input.key)).size).toBe(
      expectedMarketKeys.length,
    );

    for (const fixture of MARKET_STATUS_FIXTURES) {
      expect(getMarketStatusDescriptor(fixture.input.key)).toEqual(fixture.expected);
    }

    expect(MARKET_STATUS_FIXTURES[3].expected).not.toEqual(
      MARKET_STATUS_FIXTURES[4].expected,
    );
  });

  it("covers every anomaly severity and exact active labels", () => {
    expect(ANOMALY_SEVERITY_FIXTURES.map(({ input }) => input.severity)).toEqual(
      expectedSeverityKeys,
    );
    expect(
      new Set(ANOMALY_SEVERITY_FIXTURES.map(({ input }) => input.severity)).size,
    ).toBe(expectedSeverityKeys.length);

    for (const fixture of ANOMALY_SEVERITY_FIXTURES) {
      expect(getAnomalySeverityDescriptor(fixture.input.severity)).toEqual(
        fixture.expected.severity,
      );
      expect(formatDetectorLabel(fixture.input.detectorKey)).toBe(
        fixture.expected.detectorLabel,
      );
      expect(
        formatActiveAnomalyLabel(
          fixture.input.severity,
          fixture.input.detectorKey,
        ),
      ).toBe(fixture.expected.activeLabel);
    }

    expect(ANOMALY_SEVERITY_FIXTURES.map(({ expected }) => expected.activeLabel)).toEqual([
      "Info · Stale Data",
      "Warning · Spread Spike",
      "Critical · Price Move",
    ]);
  });

  it("matches the no-active-anomalies descriptor exactly", () => {
    expect(noActiveAnomaliesDescriptor).toEqual(
      NO_ACTIVE_ANOMALIES_FIXTURE.expected,
    );
  });

  it("covers every known detector exactly once plus deterministic unknown forms", () => {
    const knownFixtures = DETECTOR_LABEL_FIXTURES.filter(({ known }) => known);

    expect(knownFixtures.map(({ input }) => input.detectorKey)).toEqual(
      expectedKnownDetectorKeys,
    );
    expect(Object.keys(detectorLabels)).toEqual(expectedKnownDetectorKeys);
    expect(new Set(knownFixtures.map(({ input }) => input.detectorKey)).size).toBe(
      expectedKnownDetectorKeys.length,
    );

    for (const fixture of DETECTOR_LABEL_FIXTURES) {
      expect(formatDetectorLabel(fixture.input.detectorKey)).toBe(
        fixture.expectedLabel,
      );
    }

    expect(
      DETECTOR_LABEL_FIXTURES.filter(({ known }) => !known).map(
        ({ input, expectedLabel }) => [input.detectorKey, expectedLabel],
      ),
    ).toEqual([
      ["custom_liquidity_gap", "Custom Liquidity Gap"],
      ["__custom__detector__", "Custom Detector"],
      ["", "Unknown Detector"],
    ]);
    expect(formatDetectorLabel("custom_liquidity_gap")).not.toBe(
      detectorLabels.depth_sequence_gap,
    );
  });
});

describe("Data Age fixture boundaries and failures", () => {
  it("matches every valid boundary and descriptor expectation", () => {
    for (const fixture of VALID_DATA_AGE_FIXTURES) {
      expect(classifyDataAge(fixture.input)).toBe(fixture.expected.key);
      expect(getDataAgeDescriptor(fixture.input)).toEqual(
        fixture.expected.descriptor,
      );
    }

    expect(
      VALID_DATA_AGE_FIXTURES.map(({ input, expected }) => [
        input.ageMs,
        input.delayedAfterMs,
        input.staleAfterMs,
        expected.key,
      ]),
    ).toEqual([
      [null, 1_000, 5_000, "no_data"],
      [0, 1_000, 5_000, "fresh"],
      [999, 1_000, 5_000, "fresh"],
      [1_000, 1_000, 5_000, "delayed"],
      [4_999, 1_000, 5_000, "delayed"],
      [5_000, 1_000, 5_000, "stale"],
      [10_000, 1_000, 5_000, "stale"],
      [1_000, 1_000, 1_000, "stale"],
    ]);

    expect(
      new Set(VALID_DATA_AGE_FIXTURES.map(({ expected }) => expected.key)),
    ).toEqual(new Set(expectedDataAgeKeys));
  });

  it("throws the exact class and message for every invalid fixture", () => {
    for (const fixture of INVALID_DATA_AGE_FIXTURES) {
      let thrown: unknown;

      try {
        classifyDataAge(fixture.input);
      } catch (error) {
        thrown = error;
      }

      const expectedConstructor =
        errorConstructors[fixture.expectedError.name as InvalidDataAgeErrorName];
      expect(thrown).toBeInstanceOf(expectedConstructor);
      expect(thrown).toMatchObject({ message: fixture.expectedError.message });
    }
  });
});

describe("tooltip and time fact fixtures", () => {
  it("preserves zero and supplied display text while omitting only absent values", () => {
    for (const fixture of TOOLTIP_FACT_FIXTURES) {
      expect(
        createTooltipFact(fixture.input.label, fixture.input.value),
      ).toEqual(fixture.expected);
    }

    expect(TOOLTIP_FACT_FIXTURES[1].expected).toEqual({
      label: "Count",
      value: 0,
    });
    expect(TOOLTIP_FACT_FIXTURES[2].expected).toEqual({
      label: "Data age",
      value: "0 ms",
    });
    expect(TOOLTIP_FACT_FIXTURES.slice(3).map(({ expected }) => expected)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("covers every time-fact key exactly once with literal labels and values", () => {
    expect(TIME_FACT_FIXTURES.map(({ input }) => input.key)).toEqual(
      expectedTimeKeys,
    );
    expect(new Set(TIME_FACT_FIXTURES.map(({ input }) => input.key)).size).toBe(
      expectedTimeKeys.length,
    );

    for (const fixture of TIME_FACT_FIXTURES) {
      expect(createTimeFact(fixture.input.key, fixture.input.value)).toEqual(
        fixture.expected,
      );
    }

    expect(TIME_FACT_FIXTURES[1].expected).toEqual({
      label: "Last event",
      value: 0,
    });
  });
});

describe("fixture determinism and purity", () => {
  it("keeps group order, counts, flattened order, and IDs deterministic", () => {
    expect(STATUS_DESCRIPTOR_FIXTURE_GROUPS.map(({ id }) => id)).toEqual(
      expectedGroupOrder,
    );
    expect(
      STATUS_DESCRIPTOR_FIXTURE_GROUPS.map(({ fixtures }) => fixtures.length),
    ).toEqual(expectedGroupCounts);
    expect(STATUS_DESCRIPTOR_FIXTURE_INVENTORY).toHaveLength(48);

    const ids = STATUS_DESCRIPTOR_FIXTURE_INVENTORY.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("system-status-healthy");
    expect(ids[ids.length - 1]).toBe("time-fact-detected");
  });

  it("constructs literal expectations without production-function calls", () => {
    expect(fixtureSource).not.toMatch(
      /\b(?:classifyDataAge|createTimeFact|createTooltipFact|formatActiveAnomalyLabel|formatDetectorLabel|getAnomalySeverityDescriptor|getDataAgeDescriptor|getMarketStatusDescriptor|getSystemStatusDescriptor)\s*\(/,
    );
    expect(fixtureSource).not.toMatch(
      /import\s+(?!type\b)[\s\S]*?from\s+["']@\/features\/dashboard\/statusDescriptors["']/,
    );
  });

  it("has no JSX, runtime React, browser, time, random, locale, or IO dependency", () => {
    expect(fixtureSource).not.toMatch(/^\s*<\/?[A-Za-z][^>]*>/m);
    expect(fixtureSource).not.toMatch(/from\s+["']react["']/);
    expect(fixtureSource).not.toMatch(/\buse[A-Z][A-Za-z0-9]*\b/);
    expect(fixtureSource).not.toMatch(
      /\b(?:window|document|navigator|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|Date\.now|new\s+Date|Math\.random|Intl|toLocaleString|process\.env)\b/,
    );
  });

  it("contains no Replay public-mode concept and imports without browser globals", () => {
    expect(JSON.stringify(STATUS_DESCRIPTOR_FIXTURE_INVENTORY)).not.toMatch(
      /replay/i,
    );
    expect(fixtureSource).not.toMatch(/replay/i);
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    expect(typeof (globalThis as { document?: unknown }).document).toBe(
      "undefined",
    );
  });
});

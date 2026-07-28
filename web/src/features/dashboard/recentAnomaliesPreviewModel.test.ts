import { describe, expect, it } from "vitest";

import type { DashboardAnomaly } from "./types";
import {
  RECENT_ANOMALIES_PREVIEW_LIMIT,
  buildRecentAnomaliesPreview,
  mapDashboardAnomalyToRecentPreviewRow,
} from "./recentAnomaliesPreviewModel";

const BASE_ANOMALY: DashboardAnomaly = {
  id: "00000000-0000-4000-8000-000000000001",
  symbol: "BTCUSDT",
  anomaly_type: "spread_spike",
  severity: "warning",
  message: "Spread exceeded the configured threshold.",
  observed_value: 1.25,
  threshold_value: 0.5,
  event_time: "2026-07-20T10:00:00.000Z",
  created_at: "2026-07-20T10:00:01.000Z",
};

function anomaly(
  idSuffix: number,
  overrides: Partial<DashboardAnomaly> = {},
): DashboardAnomaly {
  return {
    ...BASE_ANOMALY,
    id: `00000000-0000-4000-8000-${String(idSuffix).padStart(12, "0")}`,
    ...overrides,
  };
}

describe("recent anomalies preview row model", () => {
  it("uses the exact default limit, stable UUID identity, and original row fields", () => {
    const input = anomaly(42);
    const row = mapDashboardAnomalyToRecentPreviewRow(input);
    const result = buildRecentAnomaliesPreview([input]);

    expect(RECENT_ANOMALIES_PREVIEW_LIMIT).toBe(7);
    expect(result.limit).toBe(7);
    expect(row).toMatchObject({
      id: input.id,
      symbol: input.symbol,
      anomalyType: input.anomaly_type,
      severity: input.severity,
      message: input.message,
      observedValue: input.observed_value,
      thresholdValue: input.threshold_value,
      eventTime: input.event_time,
      createdAt: input.created_at,
      effectiveTimestampMs: Date.parse(input.event_time),
    });
    expect(result.rows[0]?.id).toBe(input.id);
  });

  it("rejects duplicate anomaly IDs deterministically", () => {
    const duplicateId = "00000000-0000-4000-8000-000000000099";
    const input = [anomaly(1, { id: duplicateId }), anomaly(2, { id: duplicateId })];

    expect(() => buildRecentAnomaliesPreview(input)).toThrow(TypeError);
    expect(() => buildRecentAnomaliesPreview(input)).toThrow(
      `Duplicate anomaly id: ${duplicateId}`,
    );
  });

  it("uses accepted detector, severity, and active-label semantics", () => {
    const known = mapDashboardAnomalyToRecentPreviewRow(
      anomaly(1, { anomaly_type: "depth_sequence_gap", severity: "critical" }),
    );
    const unknown = mapDashboardAnomalyToRecentPreviewRow(
      anomaly(2, { anomaly_type: "custom_liquidity_gap", severity: "info" }),
    );

    expect(known.detectorLabel).toBe("Depth Sequence Gap");
    expect(known.severityDescriptor).toEqual({
      key: "critical",
      label: "Critical",
      tone: "critical",
      description: "A critical anomaly requires immediate attention.",
    });
    expect(known.activeLabel).toBe("Critical · Depth Sequence Gap");
    expect(unknown.detectorLabel).toBe("Custom Liquidity Gap");
    expect(unknown.activeLabel).toBe("Info · Custom Liquidity Gap");
  });

  it("preserves numeric zero, negatives, and an empty message", () => {
    const row = mapDashboardAnomalyToRecentPreviewRow(
      anomaly(1, {
        message: "",
        observed_value: 0,
        threshold_value: -2.5,
      }),
    );

    expect(row.message).toBe("");
    expect(row.observedValue).toBe(0);
    expect(row.thresholdValue).toBe(-2.5);
  });
});

describe("recent anomalies ordering", () => {
  it("sorts newest effective event time first", () => {
    const older = anomaly(1, { event_time: "2026-07-20T10:00:00.000Z" });
    const newer = anomaly(2, { event_time: "2026-07-20T10:00:02.000Z" });

    expect(buildRecentAnomaliesPreview([older, newer]).allRows.map((row) => row.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("uses created time for equal effective-event ties", () => {
    const eventTime = "2026-07-20T10:00:00.000Z";
    const earlierCreated = anomaly(1, {
      event_time: eventTime,
      created_at: "2026-07-20T10:00:01.000Z",
    });
    const laterCreated = anomaly(2, {
      event_time: eventTime,
      created_at: "2026-07-20T10:00:02.000Z",
    });

    expect(
      buildRecentAnomaliesPreview([earlierCreated, laterCreated]).allRows.map(
        (row) => row.id,
      ),
    ).toEqual([laterCreated.id, earlierCreated.id]);
  });

  it("uses anomaly ID ascending for full time ties", () => {
    const higherId = anomaly(20);
    const lowerId = anomaly(10);

    expect(buildRecentAnomaliesPreview([higherId, lowerId]).allRows.map((row) => row.id)).toEqual([
      lowerId.id,
      higherId.id,
    ]);
  });

  it("falls back from invalid event time to valid created time", () => {
    const fallbackOlder = anomaly(1, {
      event_time: "invalid-event-time",
      created_at: "2026-07-20T10:00:01.000Z",
    });
    const fallbackNewer = anomaly(2, {
      event_time: "invalid-event-time",
      created_at: "2026-07-20T10:00:02.000Z",
    });

    const result = buildRecentAnomaliesPreview([fallbackOlder, fallbackNewer]);

    expect(result.allRows.map((row) => row.id)).toEqual([
      fallbackNewer.id,
      fallbackOlder.id,
    ]);
    expect(result.allRows[0]?.effectiveTimestampMs).toBe(
      Date.parse(fallbackNewer.created_at),
    );
  });

  it("sorts both-invalid timestamps after valid timestamps and exposes null", () => {
    const invalid = anomaly(1, {
      event_time: "invalid-event-time",
      created_at: "invalid-created-time",
    });
    const valid = anomaly(2, {
      event_time: "2026-07-20T10:00:00.000Z",
    });

    const result = buildRecentAnomaliesPreview([invalid, valid]);

    expect(result.allRows.map((row) => row.id)).toEqual([valid.id, invalid.id]);
    expect(result.allRows[1]?.effectiveTimestampMs).toBeNull();
  });

  it("does not mutate the input array or anomaly objects", () => {
    const first = Object.freeze(anomaly(1, { event_time: "2026-07-20T10:00:00.000Z" }));
    const second = Object.freeze(anomaly(2, { event_time: "2026-07-20T10:00:02.000Z" }));
    const input = Object.freeze([first, second]);
    const before = JSON.stringify(input);

    const result = buildRecentAnomaliesPreview(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(input[0]).toBe(first);
    expect(input[1]).toBe(second);
    expect(result.allRows.map((row) => row.id)).toEqual([second.id, first.id]);
  });
});

type PreviewMetadataCase = Readonly<{
  name: string;
  inputCount: number;
  expectedRows: number;
  hiddenCount: number;
  hasMore: boolean;
}>;

const PREVIEW_METADATA_CASES = [
  {
    name: "fewer than limit",
    inputCount: 2,
    expectedRows: 2,
    hiddenCount: 0,
    hasMore: false,
  },
  {
    name: "equal to limit",
    inputCount: 7,
    expectedRows: 7,
    hiddenCount: 0,
    hasMore: false,
  },
  {
    name: "more than limit",
    inputCount: 9,
    expectedRows: 7,
    hiddenCount: 2,
    hasMore: true,
  },
] as const satisfies readonly PreviewMetadataCase[];

describe("recent anomalies preview limiting and metadata", () => {
  it.each(PREVIEW_METADATA_CASES)(
    "reports metadata for $name",
    ({ inputCount, expectedRows, hiddenCount, hasMore }: PreviewMetadataCase) => {
      const input = Array.from({ length: inputCount }, (_, index) =>
        anomaly(index + 1),
      );
      const result = buildRecentAnomaliesPreview(input);

      expect(result.allRows).toHaveLength(inputCount);
      expect(result.rows).toHaveLength(expectedRows);
      expect(result.totalCount).toBe(inputCount);
      expect(result.hiddenCount).toBe(hiddenCount);
      expect(result.hasMore).toBe(hasMore);
      expect(result.isEmpty).toBe(false);
    },
  );

  it("supports limit zero while preserving ordered allRows and metadata", () => {
    const first = anomaly(1, { event_time: "2026-07-20T10:00:00.000Z" });
    const second = anomaly(2, { event_time: "2026-07-20T10:00:02.000Z" });
    const result = buildRecentAnomaliesPreview([first, second], 0);

    expect(result.rows).toEqual([]);
    expect(result.allRows.map((row) => row.id)).toEqual([second.id, first.id]);
    expect(result).toMatchObject({
      limit: 0,
      totalCount: 2,
      hiddenCount: 2,
      hasMore: true,
      isEmpty: false,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5])(
    "rejects invalid non-finite or non-integer limit %s",
    (limit: number) => {
      expect(() => buildRecentAnomaliesPreview([], limit)).toThrow(TypeError);
      expect(() => buildRecentAnomaliesPreview([], limit)).toThrow(
        "limit must be a finite integer",
      );
    },
  );

  it("rejects a negative integer limit", () => {
    expect(() => buildRecentAnomaliesPreview([], -1)).toThrow(RangeError);
    expect(() => buildRecentAnomaliesPreview([], -1)).toThrow(
      "limit must be non-negative",
    );
  });

  it("returns exact empty-input metadata", () => {
    expect(buildRecentAnomaliesPreview([])).toEqual({
      allRows: [],
      rows: [],
      limit: 7,
      totalCount: 0,
      hiddenCount: 0,
      hasMore: false,
      isEmpty: true,
    });
  });
});

describe("recent anomalies deterministic purity", () => {
  it("returns equal values for equal inputs", () => {
    const input = [anomaly(1), anomaly(2, { anomaly_type: "custom_detector" })];

    expect(buildRecentAnomaliesPreview(input)).toEqual(
      buildRecentAnomaliesPreview(input),
    );
  });

  it("contains no current-time, locale, React, network, or Replay dependency", () => {
    const implementation = [
      buildRecentAnomaliesPreview,
      mapDashboardAnomalyToRecentPreviewRow,
    ].join("\n");

    expect(implementation).not.toMatch(/Date\.now|Math\.random|toLocale|Intl\.|fetch\(|react|replay/i);
  });
});

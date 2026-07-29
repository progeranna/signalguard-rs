import { describe, expect, it } from "vitest";

import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyValue,
  severityBadgeClass,
} from "./recentAnomaliesPresentation";

describe("recent anomalies presentation", () => {
  it("maps severity tones to the exact badge and value classes", () => {
    expect(severityBadgeClass("info")).toBe(
      "border-sky-400/35 bg-sky-400/10 text-sky-200",
    );
    expect(severityBadgeClass("warning")).toBe(
      "border-amber-400/35 bg-amber-400/10 text-amber-200",
    );
    expect(severityBadgeClass("critical")).toBe(
      "border-rose-400/35 bg-rose-400/10 text-rose-200",
    );
    expect(anomalyValueClass("info")).toBe("text-sky-200");
    expect(anomalyValueClass("warning")).toBe("text-amber-300");
    expect(anomalyValueClass("critical")).toBe("text-rose-300");
  });

  it("handles missing and invalid timestamps", () => {
    expect(formatAnomalyTime(null)).toBe("Unavailable");
    expect(formatAnomalyTime(undefined)).toBe("Unavailable");
    expect(formatAnomalyTime("")).toBe("Unavailable");
    expect(formatAnomalyTime("not-a-timestamp")).toBe("not-a-timestamp");
    expect(formatAnomalyTime("2026-07-28T10:11:12.000Z")).toBe(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date("2026-07-28T10:11:12.000Z")),
    );
  });

  it("formats numeric, integer, and duration anomaly values", () => {
    for (const value of [null, undefined, Number.NaN]) {
      expect(formatAnomalyValue("custom_detector", value, "observed")).toBe("—");
    }

    expect(formatAnomalyValue("price_move", 1.23456, "observed")).toBe(
      "1.235%",
    );
    expect(formatAnomalyValue("event_lag_spike", 999, "observed")).toBe(
      "999 ms",
    );
    expect(formatAnomalyValue("stale_data", 1_500, "observed")).toBe("1.5 s");
    expect(formatAnomalyValue("trade_burst", 1_234.6, "observed")).toBe(
      "1,235 /m",
    );
    expect(formatAnomalyValue("depth_sequence_gap", 12.6, "observed")).toBe(
      "13 gap",
    );
    expect(formatAnomalyValue("depth_sequence_gap", -3.4, "threshold")).toBe(
      "-3 limit",
    );
    expect(formatAnomalyValue("custom_detector", 1_234.5678, "observed")).toBe(
      "1,234.568",
    );
  });
});

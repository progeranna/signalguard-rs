import { describe, expect, it } from "vitest";

import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyType,
  formatAnomalyValue,
  severityBadgeClass,
} from "./recentAnomaliesPresentation";

describe("recent anomalies presentation", () => {
  it("formats anomaly and detector type labels", () => {
    expect(formatAnomalyType(null)).toBe("Unknown");
    expect(formatAnomalyType(undefined)).toBe("Unknown");
    expect(formatAnomalyType("")).toBe("Unknown");
    expect(formatAnomalyType("price_move")).toBe("Price Move");
    expect(formatAnomalyType("event_lag_spike")).toBe("Event Lag Spike");
    expect(formatAnomalyType("__depth__sequence_gap__")).toBe(
      "Depth Sequence Gap",
    );
  });

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
    expect(severityBadgeClass("neutral")).toBe(
      "border-slate-500/40 bg-slate-700/30 text-slate-300",
    );
    expect(anomalyValueClass("info")).toBe("text-sky-200");
    expect(anomalyValueClass("warning")).toBe("text-amber-300");
    expect(anomalyValueClass("critical")).toBe("text-rose-300");
    expect(anomalyValueClass("neutral")).toBe("text-slate-300");
  });

  it("formats event timestamps and fallback timestamps without changing missing values", () => {
    const eventTime = "2026-07-28T10:11:12.000Z";
    const createdAt = "2026-07-28T09:08:07.000Z";
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    expect(formatAnomalyTime(eventTime)).toBe(formatter.format(new Date(eventTime)));
    expect(formatAnomalyTime(createdAt)).toBe(formatter.format(new Date(createdAt)));
    expect(formatAnomalyTime(null)).toBe("Unavailable");
    expect(formatAnomalyTime(undefined)).toBe("Unavailable");
    expect(formatAnomalyTime("")).toBe("Unavailable");
    expect(formatAnomalyTime("not-a-timestamp")).toBe("not-a-timestamp");
  });

  it("preserves null, undefined, NaN, zero, and accepted non-finite value behavior", () => {
    for (const value of [null, undefined, Number.NaN]) {
      expect(formatAnomalyValue("custom_detector", value, "observed")).toBe("—");
    }

    expect(formatAnomalyValue("price_move", 0, "observed")).toBe("0.000%");
    expect(formatAnomalyValue("event_lag_spike", 0, "observed")).toBe("0 ms");
    expect(formatAnomalyValue("trade_burst", 0, "observed")).toBe("0 /m");
    expect(formatAnomalyValue("depth_sequence_gap", 0, "observed")).toBe(
      "0 gap",
    );
    expect(formatAnomalyValue("depth_sequence_gap", 0, "threshold")).toBe(
      "0 limit",
    );
    expect(formatAnomalyValue("custom_detector", 0, "observed")).toBe("0");
    expect(
      formatAnomalyValue("price_move", Number.POSITIVE_INFINITY, "observed"),
    ).toBe("Infinity%");
    expect(
      formatAnomalyValue("custom_detector", Number.POSITIVE_INFINITY, "observed"),
    ).toBe(
      new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 3,
      }).format(Number.POSITIVE_INFINITY),
    );
  });

  it("formats percentage, duration, integer, rate, gap, limit, and numeric values", () => {
    expect(formatAnomalyValue("spread_spike", 1.23456, "observed")).toBe(
      "1.235%",
    );
    expect(formatAnomalyValue("price_move", -2.34567, "threshold")).toBe(
      "-2.346%",
    );
    expect(formatAnomalyValue("event_lag_spike", 999, "observed")).toBe(
      "999 ms",
    );
    expect(formatAnomalyValue("stale_data", 1_500, "observed")).toBe("1.5 s");
    expect(formatAnomalyValue("quote_stuck", 2_250, "threshold")).toBe(
      "2.3 s",
    );
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

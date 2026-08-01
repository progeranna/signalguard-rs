import { describe, expect, it } from "vitest";

import {
  availabilityMessage,
  formatOptionalAge,
  formatOptionalCompact,
  formatTickerPercent,
  formatTickerPrice,
  marketStatusLabel,
  statusLabel,
} from "./marketHealthPresentation";

describe("market health presentation", () => {
  it("formats ticker and optional values with explicit missing-value fallbacks", () => {
    expect(formatTickerPrice(null)).toBe("—");
    expect(formatTickerPrice(undefined)).toBe("—");
    expect(formatTickerPrice("")).toBe("—");
    expect(formatTickerPrice("0.0000")).toBe("0.0000");

    for (const value of [null, undefined, Number.NaN]) {
      expect(formatTickerPercent(value)).toBe("—");
      expect(formatOptionalCompact(value)).toBe("—");
      expect(formatOptionalAge(value)).toBe("Unavailable");
    }

    expect(formatTickerPercent(0)).toBe("0.00%");
    expect(formatOptionalCompact(1_234)).toBe("1K");
    expect(formatOptionalAge(1_500)).toBe("1.5 s");
  });

  it("formats status labels and availability messages", () => {
    expect(statusLabel(null)).toBe("Unknown");
    expect(statusLabel(undefined)).toBe("Unknown");
    expect(statusLabel("")).toBe("Unknown");
    expect(statusLabel("healthy")).toBe("Healthy");

    expect(availabilityMessage("configured")).toBe(
      "Configured for Live; Live ingestion is not active.",
    );
    expect(availabilityMessage("awaiting")).toBe(
      "Awaiting first Live market data.",
    );
    expect(availabilityMessage("unavailable")).toBe(
      "Live market data is unavailable.",
    );
    expect(availabilityMessage("observed")).toBe(
      "No current market state available for this market.",
    );
  });

  it("maps market availability to the canonical market status label", () => {
    expect(marketStatusLabel("configured", null)).toBe("Configured");
    expect(marketStatusLabel("awaiting", null)).toBe("Awaiting data");
    expect(marketStatusLabel("unavailable", null)).toBe("Unavailable");
    expect(marketStatusLabel("observed", "healthy")).toBe("Healthy");
    expect(marketStatusLabel("observed", "degraded")).toBe("Degraded");
    expect(marketStatusLabel("observed", "unhealthy")).toBe("Unhealthy");
    expect(marketStatusLabel("observed", null)).toBe("Unknown");
    expect(marketStatusLabel("observed", undefined)).toBe("Unknown");
    expect(marketStatusLabel("observed", "healthy")).toBe(
      statusLabel("healthy"),
    );
  });
});

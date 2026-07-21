import { describe, expect, it } from "vitest";

import {
  dashboardSummarySchema,
  marketTimelineSchema,
  runtimeModeResponseSchema,
  symbolIdSchema,
} from "./types";

const EVENT_TIME = "2026-07-12T10:15:30.000Z";

function dashboardPayload() {
  return {
    service: { status: "ok", service: "signalguard-rs" },
    pipeline: {
      status: "healthy",
      last_message_age_ms: null,
      parse_errors: 0,
      reconnect_attempts: 0,
      storage_errors: 0,
      cache_errors: 0,
    },
    symbols: [{ symbol: " btcusdt ", state: null, health: null }],
    recent_anomalies: [
      {
        id: "9cf5cf02-8cf8-4dd0-bcb0-4d3e9b949909",
        symbol: "ethusdt",
        anomaly_type: "spread_spike",
        severity: "warning",
        message: "Spread exceeded the configured threshold",
        observed_value: 0.42,
        threshold_value: 0.25,
        event_time: EVENT_TIME,
        created_at: EVENT_TIME,
      },
    ],
  };
}

describe("symbol-bearing API schemas", () => {
  it("canonicalizes dashboard, anomaly, timeline, and runtime symbols", () => {
    const dashboard = dashboardSummarySchema.parse(dashboardPayload());
    const timeline = marketTimelineSchema.parse({
      symbol: " solusdt ",
      points: [],
      anomalies: [],
    });
    const runtime = runtimeModeResponseSchema.parse({
      mode: "live",
      mode_label: "Live",
      status: "running",
      symbols: ["btcusdt", " ETHUSDT "],
      switching_supported: false,
      source: "config",
      last_started_at: EVENT_TIME,
      last_switched_at: null,
      last_error: null,
    });

    expect(dashboard.symbols[0]?.symbol).toBe("BTCUSDT");
    expect(dashboard.recent_anomalies[0]?.symbol).toBe("ETHUSDT");
    expect(timeline.symbol).toBe("SOLUSDT");
    expect(runtime.symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
  });

  it.each(["", "BTC-USDT", "BTC/USDT", "БТКUSDT"])(
    "rejects unsupported symbol %s",
    (symbol) => {
      expect(symbolIdSchema.safeParse(symbol).success).toBe(false);
    },
  );
});

import { describe, expect, it } from "vitest";

import {
  dashboardSummarySchema,
  marketTimelineSchema,
  parseUiMode,
  runtimeModeResponseSchema,
  uiModeSchema,
  type DashboardAnomaly,
  type DashboardSummary,
  type MarketTimeline,
  type RuntimeModeResponse,
} from "./types";

const VALID_EVENT_TIME = "2026-07-12T10:15:30.000Z";
const VALID_CREATED_AT = "2026-07-12T10:15:31.000Z";

function makeValidAnomaly(): DashboardAnomaly {
  return {
    id: "9cf5cf02-8cf8-4dd0-bcb0-4d3e9b949909",
    symbol: "BTCUSDT",
    anomaly_type: "spread_spike",
    severity: "warning",
    message: "Spread exceeded the configured threshold",
    observed_value: 0.42,
    threshold_value: 0.25,
    event_time: VALID_EVENT_TIME,
    created_at: VALID_CREATED_AT,
  };
}

function makeValidDashboardSummary(): DashboardSummary {
  return {
    service: {
      status: "ok",
      service: "signalguard-rs",
    },
    pipeline: {
      status: "healthy",
      last_message_age_ms: 12,
      parse_errors: 0,
      reconnect_attempts: 0,
      storage_errors: 0,
      cache_errors: 0,
    },
    symbols: [
      {
        symbol: "BTCUSDT",
        state: {
          last_trade_price: "63250.10",
          best_bid_price: "63249.90",
          best_ask_price: "63250.20",
          spread_pct: 0.00047,
          price_change_1m_pct: 0.12,
          trades_per_minute: 18,
          last_event_time: VALID_EVENT_TIME,
          last_event_age_ms: 12,
          depth_sequence_gap_count: 0,
        },
        health: {
          score: 96,
          status: "healthy",
          recent_anomaly_count: 1,
          evaluated_at: VALID_CREATED_AT,
        },
      },
    ],
    recent_anomalies: [makeValidAnomaly()],
  };
}

function makeValidMarketTimeline(): MarketTimeline {
  return {
    symbol: "BTCUSDT",
    points: [
      {
        timestamp: VALID_EVENT_TIME,
        price: "63250.10",
        spread_pct: 0.00047,
        trades_per_minute: 18,
        last_event_age_ms: 12,
      },
    ],
    anomalies: [makeValidAnomaly()],
  };
}

function makeValidRuntimeModeResponse(): RuntimeModeResponse {
  return {
    mode: "live",
    mode_label: "Live",
    status: "running",
    symbols: ["BTCUSDT", "ETHUSDT"],
    switching_supported: false,
    source: "config",
    last_started_at: VALID_EVENT_TIME,
    last_switched_at: null,
    last_error: null,
  };
}

describe("parseUiMode", () => {
  it.each([
    ["demo", "demo"],
    ["live", "live"],
    [null, null],
    [undefined, null],
    ["", null],
    ["preview", null],
    ["DEMO", null],
    [" live ", null],
  ] as const)("parses %s as %s", (value, expected) => {
    expect(parseUiMode(value)).toBe(expected);
  });
});

describe("dashboardSummarySchema", () => {
  it("accepts a minimal valid dashboard response", () => {
    expect(dashboardSummarySchema.safeParse(makeValidDashboardSummary()).success).toBe(
      true,
    );
  });

  it("rejects a structurally invalid symbol field", () => {
    const valid = makeValidDashboardSummary();
    const payload = {
      ...valid,
      symbols: [{ ...valid.symbols[0], symbol: 42 }],
    };

    expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
  });

  it.each(["event_time", "created_at"] as const)(
    "rejects a malformed anomaly %s timestamp",
    (field) => {
      const valid = makeValidDashboardSummary();
      const anomaly = valid.recent_anomalies[0];
      const payload = {
        ...valid,
        recent_anomalies: [
          {
            ...anomaly,
            [field]: "not-a-timestamp",
          },
        ],
      };

      expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
    },
  );

  it("rejects a malformed health evaluated_at timestamp", () => {
    const valid = makeValidDashboardSummary();
    const symbol = valid.symbols[0];
    const payload = {
      ...valid,
      symbols: [
        {
          ...symbol,
          health: {
            ...symbol.health,
            evaluated_at: "not-a-timestamp",
          },
        },
      ],
    };

    expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid pipeline status", () => {
    const valid = makeValidDashboardSummary();
    const payload = {
      ...valid,
      pipeline: {
        ...valid.pipeline,
        status: "recovering",
      },
    };

    expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
  });

  it("rejects negative counters", () => {
    const valid = makeValidDashboardSummary();
    const payload = {
      ...valid,
      pipeline: {
        ...valid.pipeline,
        parse_errors: -1,
      },
    };

    expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid service identity", () => {
    const valid = makeValidDashboardSummary();
    const payload = {
      ...valid,
      service: {
        ...valid.service,
        service: "another-service",
      },
    };

    expect(dashboardSummarySchema.safeParse(payload).success).toBe(false);
  });
});

describe("marketTimelineSchema", () => {
  it("accepts a minimal valid timeline response", () => {
    expect(marketTimelineSchema.safeParse(makeValidMarketTimeline()).success).toBe(
      true,
    );
  });

  it("rejects a structurally invalid timeline symbol", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      symbol: 42,
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a malformed point timestamp", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      points: [
        {
          ...valid.points[0],
          timestamp: "not-a-timestamp",
        },
      ],
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a malformed anomaly timestamp", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      anomalies: [
        {
          ...valid.anomalies[0],
          event_time: "not-a-timestamp",
        },
      ],
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a negative last_event_age_ms", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      points: [
        {
          ...valid.points[0],
          last_event_age_ms: -1,
        },
      ],
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a malformed anomaly UUID", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      anomalies: [
        {
          ...valid.anomalies[0],
          id: "not-a-uuid",
        },
      ],
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid anomaly severity", () => {
    const valid = makeValidMarketTimeline();
    const payload = {
      ...valid,
      anomalies: [
        {
          ...valid.anomalies[0],
          severity: "fatal",
        },
      ],
    };

    expect(marketTimelineSchema.safeParse(payload).success).toBe(false);
  });
});

describe("runtime and UI mode schemas", () => {
  it.each(["replay", "preview", "DEMO", ""])(
    "uiModeSchema rejects %s",
    (value) => {
      expect(uiModeSchema.safeParse(value).success).toBe(false);
    },
  );

  it("accepts a minimal valid runtime mode response", () => {
    expect(
      runtimeModeResponseSchema.safeParse(makeValidRuntimeModeResponse()).success,
    ).toBe(true);
  });

  it("rejects an invalid runtime mode", () => {
    const valid = makeValidRuntimeModeResponse();
    const payload = {
      ...valid,
      mode: "demo",
    };

    expect(runtimeModeResponseSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid runtime status", () => {
    const valid = makeValidRuntimeModeResponse();
    const payload = {
      ...valid,
      status: "ready",
    };

    expect(runtimeModeResponseSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid runtime source", () => {
    const valid = makeValidRuntimeModeResponse();
    const payload = {
      ...valid,
      source: "operator",
    };

    expect(runtimeModeResponseSchema.safeParse(payload).success).toBe(false);
  });

  it.each(["last_started_at", "last_switched_at"] as const)(
    "rejects a malformed optional %s timestamp",
    (field) => {
      const valid = makeValidRuntimeModeResponse();
      const payload = {
        ...valid,
        [field]: "not-a-timestamp",
      };

      expect(runtimeModeResponseSchema.safeParse(payload).success).toBe(false);
    },
  );
});

import { describe, expect, it, vi } from "vitest";

import { adaptMarketDetailResource } from "./marketAdapters";
import { resolveSymbolMarketResource, type SymbolMarketQueryBundle } from "./symbolMarketResource";
import { resolveSymbolPopupResource } from "./symbolPopupResource";
import { createSymbolPopupIdentity } from "./symbolPopup";
import { requireSymbolId } from "./symbolId";
import type {
  AnomaliesResponse,
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
  MarketHealth,
  MarketState,
  MarketTimeline,
  UiMode,
} from "./types";

const refetch = vi.fn(async () => undefined);

function symbolId(value: string) {
  return requireSymbolId(value);
}

function anomaly(
  symbol: string,
  id = "00000000-0000-4000-8000-000000000001",
): DashboardAnomaly {
  return {
    anomaly_type: "spread_spike",
    created_at: "2026-07-20T10:00:00.000Z",
    event_time: "2026-07-20T10:00:00.000Z",
    id,
    message: `${symbol} anomaly`,
    observed_value: 1.25,
    severity: "warning",
    symbol,
    threshold_value: 0.5,
  };
}

function summarySymbol(
  symbol: string,
  options: {
    healthStatus?: "healthy" | "degraded" | "unhealthy";
    nullState?: boolean;
    price?: string;
  } = {},
): DashboardSymbolSummary {
  const state = options.nullState
    ? {
        best_ask_price: null,
        best_bid_price: null,
        depth_sequence_gap_count: null,
        last_event_age_ms: null,
        last_event_time: null,
        last_trade_price: null,
        price_change_1m_pct: null,
        spread_pct: null,
        trades_per_minute: null,
      }
    : {
        best_ask_price: options.price ?? "101.00",
        best_bid_price: options.price ?? "99.00",
        depth_sequence_gap_count: 2,
        last_event_age_ms: 1_500,
        last_event_time: "2026-07-20T10:00:00.000Z",
        last_trade_price: options.price ?? "100.00",
        price_change_1m_pct: 0.25,
        spread_pct: 0.5,
        trades_per_minute: 12,
      };

  return {
    health: {
      evaluated_at: "2026-07-20T10:00:00.000Z",
      recent_anomaly_count: 1,
      score:
        options.healthStatus === "unhealthy"
          ? 40
          : options.healthStatus === "degraded"
            ? 70
            : 95,
      status: options.healthStatus ?? "healthy",
    },
    state,
    symbol,
  };
}

function resource(
  mode: UiMode,
  symbol: string,
  options: {
    anomalies?: DashboardAnomaly[];
    healthStatus?: "healthy" | "degraded" | "unhealthy";
    nullState?: boolean;
    price?: string;
    summarySymbol?: string;
  } = {},
) {
  return {
    anomalies: options.anomalies ?? [anomaly(symbol)],
    mode,
    summary: summarySymbol(options.summarySymbol ?? symbol, options),
    symbol: symbolId(symbol),
  };
}

function query<T>(data: T | null | undefined) {
  return {
    data,
    error: null,
    isError: false,
    isLoading: false,
    refetch,
  };
}

function bundle(overrides: Partial<SymbolMarketQueryBundle>): SymbolMarketQueryBundle {
  return {
    anomalies: query<AnomaliesResponse>(undefined),
    demoSummary: query<DashboardSummary>(undefined),
    health: query<MarketHealth>(undefined),
    state: query<MarketState>(undefined),
    timeline: query<MarketTimeline>(undefined),
    ...overrides,
  };
}

function liveState(symbol: string): MarketState {
  const state = summarySymbol(symbol).state;

  if (!state) {
    throw new Error("test state missing");
  }

  return { ...state, symbol };
}

function liveHealth(symbol: string): MarketHealth {
  const health = summarySymbol(symbol).health;

  if (!health) {
    throw new Error("test health missing");
  }

  return { ...health, symbol };
}

describe("market detail DTO-to-view-model adapter", () => {
  it("maps a full Live market resource into the explicit display model", () => {
    const expected = { mode: "live" as const, symbol: symbolId("BTCUSDT") };
    const viewModel = adaptMarketDetailResource(
      expected,
      resource("live", "BTCUSDT"),
    );

    expect(viewModel).toMatchObject({
      identity: expected,
      hasAnomalies: true,
      hasState: true,
      metrics: {
        anomalyCount: { popup: "1", route: "1" },
        bestAsk: "101.00",
        bestBid: "99.00",
        depthSequenceGaps: "2",
        freshness: { popup: "1.5 s", route: "1.5 s" },
        healthScore: "95",
        lastPrice: "100.00",
        priceMoveOneMinute: "0.25%",
        spread: "0.50%",
        tradesPerMinute: "12",
      },
      status: { text: "Healthy", tone: "healthy" },
    });
    expect(viewModel.anomalies[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      observed: { popup: "1.250%", route: "1.25" },
      severityText: "Warning",
      severityTone: "warning",
      symbol: "BTCUSDT",
      threshold: { popup: "0.500%", route: "0.5" },
      type: "Spread Spike",
    });
  });

  it("maps Demo data distinctly and uses only its supplied timeline anomalies", () => {
    const demoAnomaly = anomaly(
      "ETHUSDT",
      "00000000-0000-4000-8000-000000000002",
    );
    const viewModel = adaptMarketDetailResource(
      { mode: "demo", symbol: symbolId("ETHUSDT") },
      resource("demo", "ETHUSDT", {
        anomalies: [demoAnomaly],
        price: "200.00",
      }),
    );

    expect(viewModel.identity).toEqual({ mode: "demo", symbol: "ETHUSDT" });
    expect(viewModel.metrics.lastPrice).toBe("200.00");
    expect(viewModel.anomalies.map((entry) => entry.id)).toEqual([
      demoAnomaly.id,
    ]);
  });

  it("keeps null optional values missing instead of inventing zeroes", () => {
    const viewModel = adaptMarketDetailResource(
      { mode: "live", symbol: symbolId("BTCUSDT") },
      resource("live", "BTCUSDT", { anomalies: [], nullState: true }),
    );

    expect(viewModel.metrics).toMatchObject({
      bestAsk: "—",
      bestBid: "—",
      depthSequenceGaps: "—",
      freshness: { popup: "Unavailable", route: "—" },
      lastEvent: "—",
      lastPrice: "—",
      priceMoveOneMinute: "—",
      spread: "—",
      tradesPerMinute: "—",
    });
  });

  it.each([
    ["healthy", "Healthy", "healthy"],
    ["degraded", "Degraded", "degraded"],
    ["unhealthy", "Unhealthy", "unhealthy"],
  ] as const)(
    "derives %s status text and tone",
    (healthStatus, text, tone) => {
      const viewModel = adaptMarketDetailResource(
        { mode: "live", symbol: symbolId("BTCUSDT") },
        resource("live", "BTCUSDT", { healthStatus }),
      );

      expect(viewModel.status).toEqual({ text, tone });
    },
  );

  it("represents an empty anomaly set without fabricated rows", () => {
    const viewModel = adaptMarketDetailResource(
      { mode: "live", symbol: symbolId("BTCUSDT") },
      resource("live", "BTCUSDT", { anomalies: [] }),
    );

    expect(viewModel.hasAnomalies).toBe(false);
    expect(viewModel.anomalies).toEqual([]);
    expect(viewModel.metrics.anomalyCount).toEqual({ popup: "0", route: "0" });
  });

  it("preserves exact anomaly identity and input order", () => {
    const first = anomaly(
      "BTCUSDT",
      "00000000-0000-4000-8000-000000000002",
    );
    const second = anomaly(
      "BTCUSDT",
      "00000000-0000-4000-8000-000000000001",
    );
    const viewModel = adaptMarketDetailResource(
      { mode: "live", symbol: symbolId("BTCUSDT") },
      resource("live", "BTCUSDT", { anomalies: [first, second] }),
    );

    expect(viewModel.anomalies.map(({ id, symbol }) => ({ id, symbol }))).toEqual([
      { id: first.id, symbol: "BTCUSDT" },
      { id: second.id, symbol: "BTCUSDT" },
    ]);
  });

  it("rejects resource, summary, and anomaly identities from another market", () => {
    const expected = { mode: "live" as const, symbol: symbolId("BTCUSDT") };

    expect(() =>
      adaptMarketDetailResource(expected, resource("live", "ETHUSDT")),
    ).toThrow(/resource identity mismatch/);
    expect(() =>
      adaptMarketDetailResource(
        expected,
        resource("live", "BTCUSDT", { summarySymbol: "ETHUSDT" }),
      ),
    ).toThrow(/summary symbol mismatch/);
    expect(() =>
      adaptMarketDetailResource(
        expected,
        resource("live", "BTCUSDT", { anomalies: [anomaly("ETHUSDT")] }),
      ),
    ).toThrow(/anomaly symbol mismatch/);
  });

  it("keeps Demo and Live models distinct for the same symbol", () => {
    const symbol = symbolId("BTCUSDT");
    const demo = adaptMarketDetailResource(
      { mode: "demo", symbol },
      resource("demo", "BTCUSDT", { price: "100.00" }),
    );
    const live = adaptMarketDetailResource(
      { mode: "live", symbol },
      resource("live", "BTCUSDT", { price: "101.00" }),
    );

    expect(demo.identity.mode).toBe("demo");
    expect(live.identity.mode).toBe("live");
    expect(demo.metrics.lastPrice).toBe("100.00");
    expect(live.metrics.lastPrice).toBe("101.00");
  });

  it("produces equal route and popup models for one successful identity", () => {
    const identity = { mode: "live" as const, symbol: symbolId("BTCUSDT") };
    const queries = bundle({
      anomalies: query({ anomalies: [anomaly("BTCUSDT")] }),
      health: query(liveHealth("BTCUSDT")),
      state: query(liveState("BTCUSDT")),
    });
    const routeState = resolveSymbolMarketResource(identity, queries);
    const popupIdentity = createSymbolPopupIdentity(
      "live",
      "BTCUSDT",
      "dashboard",
    );

    if (!popupIdentity) {
      throw new Error("popup identity missing");
    }

    const popupState = resolveSymbolPopupResource(popupIdentity, queries);
    expect(routeState.status).toBe("success");
    expect(popupState.status).toBe("success");

    if (routeState.status !== "success" || popupState.status !== "success") {
      throw new Error("successful resources required");
    }

    expect(adaptMarketDetailResource(identity, routeState.resource)).toEqual(
      adaptMarketDetailResource(identity, popupState.resource),
    );
  });

  it("preserves resolver rejection for mismatched state, health, timeline, and anomaly DTO identities", () => {
    const liveIdentity = { mode: "live" as const, symbol: symbolId("BTCUSDT") };

    expect(() =>
      resolveSymbolMarketResource(
        liveIdentity,
        bundle({
          anomalies: query({ anomalies: [] }),
          health: query(liveHealth("BTCUSDT")),
          state: query(liveState("ETHUSDT")),
        }),
      ),
    ).toThrow(/state resource symbol mismatch/);
    expect(() =>
      resolveSymbolMarketResource(
        liveIdentity,
        bundle({
          anomalies: query({ anomalies: [] }),
          health: query(liveHealth("ETHUSDT")),
          state: query(liveState("BTCUSDT")),
        }),
      ),
    ).toThrow(/health resource symbol mismatch/);
    expect(() =>
      resolveSymbolMarketResource(
        liveIdentity,
        bundle({
          anomalies: query({ anomalies: [anomaly("ETHUSDT")] }),
          health: query(liveHealth("BTCUSDT")),
          state: query(liveState("BTCUSDT")),
        }),
      ),
    ).toThrow(/anomaly resource symbol mismatch/);

    const demoIdentity = { mode: "demo" as const, symbol: symbolId("BTCUSDT") };
    expect(() =>
      resolveSymbolMarketResource(
        demoIdentity,
        bundle({
          demoSummary: query({
            pipeline: {
              cache_errors: 0,
              last_message_age_ms: 0,
              parse_errors: 0,
              reconnect_attempts: 0,
              status: "healthy",
              storage_errors: 0,
            },
            recent_anomalies: [],
            service: { service: "signalguard-rs", status: "ok" },
            symbols: [summarySymbol("BTCUSDT")],
          }),
          timeline: query({
            anomalies: [],
            points: [],
            symbol: "ETHUSDT",
          }),
        }),
      ),
    ).toThrow(/timeline resource symbol mismatch/);
  });
});

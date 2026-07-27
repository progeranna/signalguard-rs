import { describe, expect, it } from "vitest";

import { adaptMarketResourceToViewModel } from "./marketAdapters";
import { parseSymbolId } from "./symbolId";
import type { SymbolMarketResourceData } from "./symbolMarketResource";

const symbol = parseSymbolId("BTCUSDT")!;
const otherSymbol = parseSymbolId("ETHUSDT")!;

function resource(overrides: Partial<SymbolMarketResourceData> = {}): SymbolMarketResourceData {
  return {
    mode: "live",
    symbol,
    anomalies: [],
    summary: {
      source: "live",
      availability: "observed",
      symbol,
      state: {
        best_ask_price: "101.00",
        best_bid_price: "99.00",
        depth_sequence_gap_count: 2,
        last_event_age_ms: 1200,
        last_event_time: "2026-07-26T10:00:00.000Z",
        last_trade_price: "100.00",
        price_change_1m_pct: 1.25,
        spread_pct: 2,
        trades_per_minute: 12,
      },
      health: {
        evaluated_at: "2026-07-26T10:00:00.000Z",
        recent_anomaly_count: 0,
        score: 92,
        status: "healthy",
      },
    },
    ...overrides,
  };
}

describe("market resource adapters", () => {
  it("maps a complete Live resource and preserves identity", () => {
    const viewModel = adaptMarketResourceToViewModel(resource());

    expect(viewModel.identity).toEqual({ mode: "live", symbol });
    expect(viewModel.metrics).toMatchObject({
      bestAsk: "101.00",
      bestBid: "99.00",
      lastPrice: "100.00",
      spread: "2.00%",
      tradesPerMinute: "12",
    });
    expect(viewModel.status).toEqual({ text: "Healthy", tone: "healthy" });
  });

  it("maps a complete Demo resource without Live fallback", () => {
    const viewModel = adaptMarketResourceToViewModel(resource({ mode: "demo", summary: { ...resource().summary, source: "demo" } }));

    expect(viewModel.identity.mode).toBe("demo");
    expect(viewModel.metrics.lastPrice).toBe("100.00");
  });

  it("rejects a requested mode or symbol that differs from the resource", () => {
    expect(() => adaptMarketResourceToViewModel(resource(), { mode: "demo", symbol })).toThrow(
      "mode mismatch",
    );
    expect(() => adaptMarketResourceToViewModel(resource(), { mode: "live", symbol: otherSymbol })).toThrow(
      "symbol mismatch",
    );
  });

  it.each([
    ["healthy", "healthy"],
    ["degraded", "degraded"],
    ["unhealthy", "unhealthy"],
  ] as const)("derives %s status text and tone", (status, tone) => {
    const viewModel = adaptMarketResourceToViewModel(resource({
      summary: { ...resource().summary, health: { ...resource().summary.health!, status } },
    }));
    expect(viewModel.status).toEqual({ text: status.charAt(0).toUpperCase() + status.slice(1), tone });
  });

  it("keeps null values unavailable rather than converting them to zero", () => {
    const viewModel = adaptMarketResourceToViewModel(resource({
      summary: {
        ...resource().summary,
        state: { ...resource().summary.state!, best_ask_price: null, spread_pct: null, trades_per_minute: null },
      },
    }));
    expect(viewModel.metrics.bestAsk).toBe("—");
    expect(viewModel.metrics.spread).toBe("—");
    expect(viewModel.metrics.tradesPerMinute).toBe("—");
    expect(viewModel.metrics.bestAsk).not.toBe("0");
  });

  it("maps empty anomalies without fabricating rows", () => {
    expect(adaptMarketResourceToViewModel(resource()).anomalies).toEqual([]);
  });

  it("preserves anomaly identity and route/popup display variants", () => {
    const anomaly = {
      id: "00000000-0000-0000-0000-000000000001",
      symbol,
      anomaly_type: "spread_spike",
      severity: "warning" as const,
      message: "spread widened",
      observed_value: 2.5,
      threshold_value: 1,
      event_time: "2026-07-26T10:00:00.000Z",
      created_at: "2026-07-26T10:00:00.000Z",
    };
    const viewModel = adaptMarketResourceToViewModel(resource({ anomalies: [anomaly] }));
    expect(viewModel.anomalies[0]).toMatchObject({
      id: anomaly.id,
      symbol,
      type: "Spread Spike",
      observed: { route: "2.5", popup: "2.500%" },
    });
    expect(viewModel.anomalies[0].severity).toMatchObject({ text: "Warning", tone: "warning", key: "warning" });
  });

  it("keeps generic route values and type-aware popup units", () => {
    const anomalies = [
      { id: "00000000-0000-0000-0000-000000000002", symbol, anomaly_type: "event_lag_spike", severity: "critical" as const, message: "", observed_value: 2500, threshold_value: 1000, event_time: "2026-07-26T10:00:00.000Z", created_at: "2026-07-26T10:00:00.000Z" },
      { id: "00000000-0000-0000-0000-000000000003", symbol, anomaly_type: "trade_burst", severity: "warning" as const, message: "", observed_value: 12, threshold_value: 10, event_time: "2026-07-26T10:00:00.000Z", created_at: "2026-07-26T10:00:00.000Z" },
      { id: "00000000-0000-0000-0000-000000000004", symbol, anomaly_type: "depth_sequence_gap", severity: "warning" as const, message: "", observed_value: 3, threshold_value: 2, event_time: "2026-07-26T10:00:00.000Z", created_at: "2026-07-26T10:00:00.000Z" },
    ];
    const mapped = adaptMarketResourceToViewModel(resource({ anomalies })).anomalies;
    expect(mapped.map((anomaly) => [anomaly.observed.route, anomaly.observed.popup])).toEqual([
      ["2,500", "2.5 s"],
      ["12", "12 /m"],
      ["3", "3 gap"],
    ]);
    expect(mapped[2].threshold).toEqual({ route: "2", popup: "2 limit" });
  });

  it("keeps null anomaly values unavailable in both variants", () => {
    const anomaly = {
      id: "00000000-0000-0000-0000-000000000005", symbol, anomaly_type: "spread_spike", severity: "info" as const, message: "", observed_value: null, threshold_value: null, event_time: "2026-07-26T10:00:00.000Z", created_at: "2026-07-26T10:00:00.000Z",
    };
    const mapped = adaptMarketResourceToViewModel(resource({ anomalies: [anomaly] })).anomalies[0];
    expect(mapped.observed).toEqual({ route: "—", popup: "—" });
    expect(mapped.threshold).toEqual({ route: "—", popup: "—" });
  });

  it("preserves absent state and real zero depth gaps", () => {
    const withoutState = adaptMarketResourceToViewModel(resource({
      summary: { ...resource().summary, state: null },
    }));
    const withZeroGaps = adaptMarketResourceToViewModel(resource({
      summary: { ...resource().summary, state: { ...resource().summary.state!, depth_sequence_gap_count: 0 } },
    }));
    expect(withoutState.stateAvailable).toBe(false);
    expect(withoutState.metrics.depthGaps).toBe("—");
    expect(withoutState.metrics.lastPrice).toBe("—");
    expect(withZeroGaps.stateAvailable).toBe(true);
    expect(withZeroGaps.metrics.depthGaps).toBe("0");
  });

  it.each([
    ["symbol", resource({ symbol: otherSymbol })],
    ["summary", resource({ summary: { ...resource().summary, symbol: otherSymbol } })],
    ["anomaly", resource({ anomalies: [{
      id: "00000000-0000-0000-0000-000000000001", symbol: otherSymbol, anomaly_type: "spread_spike", severity: "warning", message: "", observed_value: null, threshold_value: null, event_time: "2026-07-26T10:00:00.000Z", created_at: "2026-07-26T10:00:00.000Z",
    }] })],
  ])("rejects mismatched %s identity deterministically", (_kind, input) => {
    expect(() => adaptMarketResourceToViewModel(input)).toThrow(TypeError);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardAnomaly, DashboardSymbolSummary, MarketTimelinePoint } from "./types";
import { TimelinePanel, type TimelinePanelProps } from "./TimelinePanel";

let tooltipProps: Record<string, unknown> = {};
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, data }: { children: ReactNode; data: unknown }) => <div data-testid="chart" data-data={JSON.stringify(data)}>{children}</div>,
  CartesianGrid: () => null,
  XAxis: (p: Record<string, unknown>) => <div data-testid="x" data-domain={JSON.stringify(p.domain)} />,
  YAxis: (p: Record<string, unknown>) => <div data-testid="y" data-domain={JSON.stringify(p.domain)} />,
  ReferenceLine: (p: Record<string, unknown>) => <div data-testid="line" data-x={String(p.x)} data-stroke={String(p.stroke)} />,
  Area: (p: Record<string, unknown>) => <div data-testid="area" data-props={JSON.stringify(p)} />,
  Tooltip: ({ content }: { content: ReactNode }) => <div data-testid="tooltip">{isValidElement(content) ? cloneElement(content as ReactElement<Record<string, unknown>>, tooltipProps) : null}</div>,
}));

const source = readFileSync(path.join(process.cwd(), "src/features/dashboard/TimelinePanel.tsx"), "utf8");
const anchor = Date.parse("2026-07-20T10:05:00.000Z");
const p = (timestamp: string, price: string, extra: Partial<MarketTimelinePoint> = {}): MarketTimelinePoint => ({
  timestamp, price, spread_pct: 0.02, trades_per_minute: 42, last_event_age_ms: 250, ...extra,
});
const a = (id: string, severity: DashboardAnomaly["severity"], event_time: string, extra: Partial<DashboardAnomaly> = {}): DashboardAnomaly => ({
  id, symbol: "BTCUSDT", anomaly_type: "spread_spike", severity, message: "Spread widened",
  observed_value: 0.9, threshold_value: 0.5, event_time, created_at: event_time, ...extra,
});
function market(extra: Partial<DashboardSymbolSummary> = {}): DashboardSymbolSummary {
  return {
    source: "live", availability: "observed", symbol: "BTCUSDT",
    state: { last_trade_price: "100.00", best_bid_price: "99.99", best_ask_price: "100.01", spread_pct: 0.02,
      price_change_1m_pct: 0.1, trades_per_minute: 42, last_event_time: "2026-07-20T10:02:00.000Z",
      last_event_age_ms: 250, depth_sequence_gap_count: 0 },
    health: { score: 98, status: "healthy", recent_anomaly_count: 0, evaluated_at: "2026-07-20T10:02:01.000Z" },
    ...extra,
  };
}
function mount(extra: Partial<TimelinePanelProps> = {}) {
  return render(<TimelinePanel selectedMarket={market()} timelinePoints={[
    p("2026-07-20T10:00:00.000Z", "100.00"), p("2026-07-20T10:02:00.000Z", "102.00"),
  ]} timelineAnomalies={[]} isSummaryLoading={false} isTimelineLoading={false}
  timelineErrorMessage={null} onRetryTimeline={vi.fn()} emptyAnchorMs={anchor} {...extra} />);
}
beforeEach(() => { tooltipProps = {}; });

describe("TimelinePanel render matrix", () => {
  it("enforces summary/no-market and all non-observed states", () => {
    const first = mount({ isSummaryLoading: true, selectedMarket: null, timelineErrorMessage: "hidden" });
    expect(first.container.querySelector(".h-40")).not.toBeNull();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
    first.unmount();

    mount({ selectedMarket: null, timelinePoints: [], timelineAnomalies: [] });
    for (const text of ["Unknown market", "No data yet", "Waiting for market data", "No current market state available for this market."]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }

    for (const [availability, status, message] of [
      ["configured", "Configured", "Configured for Live; Live ingestion is not active."],
      ["awaiting", "Awaiting data", "Awaiting first Live market data."],
      ["unavailable", "Unavailable", "Live market data is unavailable."],
    ] as const) {
      const view = mount({ selectedMarket: market({ availability, state: null, health: null }), isTimelineLoading: true,
        timelineErrorMessage: "hidden", timelineAnomalies: [a(availability, "critical", "2026-07-20T10:01:00.000Z")] });
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getAllByText(message)).toHaveLength(2);
      expect(screen.queryByText("hidden")).not.toBeInTheDocument();
      expect(screen.queryByText("Critical anomaly")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("enforces observed error > loading > normalized-empty > chart", () => {
    const retry = vi.fn();
    const error = mount({ timelineErrorMessage: "transport failed", isTimelineLoading: true, onRetryTimeline: retry });
    expect(screen.getByText("Market timeline unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    error.unmount();

    const loading = mount({ timelinePoints: [], isTimelineLoading: true });
    expect(loading.container.querySelector(".h-\\[320px\\]")).not.toBeNull();
    expect(screen.queryByText("Waiting for market data")).not.toBeInTheDocument();
    loading.unmount();

    mount({ timelinePoints: [p("invalid", "100"), p("2026-07-20T10:00:00.000Z", " ")] });
    expect(screen.getByText("Waiting for market data")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });
});

describe("TimelinePanel chart and snapshot parity", () => {
  it("uses accepted normalization/domains, exact source, severity, and in-domain markers", () => {
    mount({ selectedMarket: market({ source: "demo" }), timelinePoints: [
      p("2026-07-20T10:02:00.000Z", "102.00"), p("invalid", "999"),
      p("2026-07-20T10:00:00.000Z", "100.00"), p("2026-07-20T10:01:00.000Z", "NaN"),
    ], timelineAnomalies: [
      a("1", "info", "2026-07-20T10:00:30.000Z"), a("2", "warning", "2026-07-20T10:01:00.000Z"),
      a("3", "critical", "2026-07-20T09:59:59.999Z"), a("4", "critical", "invalid"),
    ] });
    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Critical anomaly")).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId("chart").getAttribute("data-data") ?? "[]")).toHaveLength(2);
    expect(screen.getByTestId("x")).toHaveAttribute("data-domain", JSON.stringify([
      Date.parse("2026-07-20T10:00:00.000Z"), Date.parse("2026-07-20T10:02:00.000Z"),
    ]));
    expect(screen.getByTestId("y")).toHaveAttribute("data-domain", JSON.stringify([99.796, 102.204]));
    expect(screen.getAllByTestId("line").map((line) => line.getAttribute("data-stroke"))).toEqual(["#63A7FF", "#F5C542"]);
    expect(screen.getByTestId("area").getAttribute("data-props")).toContain('"isAnimationActive":false');
  });

  it("preserves tooltip facts and inclusive ±15-second anomaly matching", () => {
    const timestamp = "2026-07-20T10:01:00.000Z";
    tooltipProps = { active: true, label: Date.parse(timestamp), payload: [{ payload: {
      timestamp, timestampMs: Date.parse(timestamp), price: 101, priceLabel: "101.0000",
      spreadPct: 0, tradesPerMinute: 0, lastEventAgeMs: 0,
    } }] };
    mount({ timelineAnomalies: [
      a("1", "warning", "2026-07-20T10:01:15.000Z"),
      a("2", "critical", "2026-07-20T10:01:15.001Z", { anomaly_type: "trade_burst" }),
    ] });
    const tip = screen.getByTestId("tooltip");
    for (const text of ["Price: 101.0000", "Spread: 0.00%", "Trades/min: 0", "Freshness: 0 ms", "Anomalies: Spread Spike (Warning)"]) {
      expect(within(tip).getByText(text)).toBeInTheDocument();
    }
    expect(within(tip).queryByText(/Trade Burst/)).not.toBeInTheDocument();
  });

  it("formats snapshot zero and current status wording", () => {
    mount({ selectedMarket: market({ state: { last_trade_price: "0", best_bid_price: "0", best_ask_price: "0", spread_pct: 0,
      price_change_1m_pct: 0, trades_per_minute: 0, last_event_time: "2026-07-20T10:02:00.000Z",
      last_event_age_ms: 0, depth_sequence_gap_count: 0 },
      health: { score: 50, status: "degraded", recent_anomaly_count: 0, evaluated_at: "2026-07-20T10:02:01.000Z" } }) });
    for (const [label, value] of [["Price", "0"], ["Spread", "0.00%"], ["Trades/min", "0"], ["Freshness", "0 ms"]]) {
      expect(within(screen.getByText(label).parentElement as HTMLElement).getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });
});

describe("TimelinePanel deterministic scope", () => {
  it("does not mutate inputs and preserves current copy/layout", () => {
    const selectedMarket = Object.freeze(market());
    const timelinePoint = Object.freeze(p("2026-07-20T10:00:00.000Z", "100"));
    const timelineAnomaly = Object.freeze(a("1", "warning", "2026-07-20T10:00:00.000Z"));
    const timelinePoints = Object.freeze([timelinePoint]);
    const timelineAnomalies = Object.freeze([timelineAnomaly]);
    const before = JSON.stringify({ selectedMarket, timelinePoints, timelineAnomalies });
    const { container } = mount({ selectedMarket, timelinePoints, timelineAnomalies });
    expect(JSON.stringify({ selectedMarket, timelinePoints, timelineAnomalies })).toBe(before);
    expect(container.querySelector('.lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_248px\\]')).not.toBeNull();
    expect(container.querySelector("aside.min-h-\\[285px\\]")).not.toBeNull();
    for (const label of ["Price", "Spread", "Trades/min", "Freshness"]) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("proves accepted ownership, current visual copy, and forbidden dependency absence", () => {
    expect(source).toMatch(/import\s+\{\s*buildTimelineDomains\s*\}\s+from\s+["']\.\/timelineDomains["'];/);
    expect(source).toMatch(/normalizeTimelinePoints[\s\S]*from\s+["']\.\/timelineNormalization["'];/);
    expect(source).toContain("buildTimelineDomains(normalizedTimelinePoints, emptyAnchorMs)");
    for (const text of ['id="marketTimelineFill"', 'stroke="#7EE45B"', "isAnimationActive={false}", "Market timeline unavailable", "Waiting for market data"]) expect(source).toContain(text);
    expect(source).not.toMatch(/\bDate\.now\s*\(|\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|Math\.random)\b/);
    expect(source).not.toMatch(/from\s+["'][^"']*(?:api|query|router|routing|popup|storage)[^"']*["']/i);
    expect(source).not.toMatch(/\buse[A-Z][A-Za-z0-9]*\s*\(|\breplay\b/i);
    expect(source).not.toMatch(/function\s+(?:buildTimeline(?:Price|Time)?Domain|normalizeTimeline)/);
  });
});

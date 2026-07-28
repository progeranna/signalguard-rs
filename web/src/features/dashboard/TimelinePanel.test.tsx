import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TimelinePanel, type TimelinePanelProps } from "./TimelinePanel";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
  MarketTimelinePoint,
} from "./types";

let tooltipProps: Record<string, unknown> = {};

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, data }: { children: ReactNode; data: unknown }) => (
    <div data-testid="chart" data-data={JSON.stringify(data)}>{children}</div>
  ),
  CartesianGrid: () => null,
  XAxis: (props: Record<string, unknown>) => (
    <div data-testid="x-axis" data-domain={JSON.stringify(props.domain)} />
  ),
  YAxis: (props: Record<string, unknown>) => (
    <div data-testid="y-axis" data-domain={JSON.stringify(props.domain)} />
  ),
  ReferenceLine: (props: Record<string, unknown>) => (
    <div
      data-testid="reference-line"
      data-stroke={String(props.stroke)}
      data-x={String(props.x)}
    />
  ),
  Area: (props: Record<string, unknown>) => (
    <div data-testid="area" data-props={JSON.stringify(props)} />
  ),
  Tooltip: ({ content }: { content: ReactNode }) => (
    <div data-testid="tooltip">
      {isValidElement(content)
        ? cloneElement(content as ReactElement<Record<string, unknown>>, tooltipProps)
        : null}
    </div>
  ),
}));

const componentSource = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/TimelinePanel.tsx"),
  "utf8",
);
const dashboardPageSource = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);
const emptyAnchorMs = Date.parse("2026-07-20T10:05:00.000Z");

function point(
  timestamp: string,
  price: string,
  extra: Partial<MarketTimelinePoint> = {},
): MarketTimelinePoint {
  return {
    timestamp,
    price,
    spread_pct: 0.02,
    trades_per_minute: 42,
    last_event_age_ms: 250,
    ...extra,
  };
}

function anomaly(
  id: string,
  severity: DashboardAnomaly["severity"],
  eventTime: string,
  extra: Partial<DashboardAnomaly> = {},
): DashboardAnomaly {
  return {
    id,
    symbol: "BTCUSDT",
    anomaly_type: "spread_spike",
    severity,
    message: "Spread widened",
    observed_value: 0.9,
    threshold_value: 0.5,
    event_time: eventTime,
    created_at: eventTime,
    ...extra,
  };
}

function market(
  extra: Partial<DashboardSymbolSummary> = {},
): DashboardSymbolSummary {
  return {
    source: "live",
    availability: "observed",
    symbol: "BTCUSDT",
    state: {
      last_trade_price: "100.00",
      best_bid_price: "99.99",
      best_ask_price: "100.01",
      spread_pct: 0.02,
      price_change_1m_pct: 0.1,
      trades_per_minute: 42,
      last_event_time: "2026-07-20T10:02:00.000Z",
      last_event_age_ms: 250,
      depth_sequence_gap_count: 0,
    },
    health: {
      score: 98,
      status: "healthy",
      recent_anomaly_count: 0,
      evaluated_at: "2026-07-20T10:02:01.000Z",
    },
    ...extra,
  };
}

function mount(extra: Partial<TimelinePanelProps> = {}) {
  return render(
    <TimelinePanel
      selectedMarket={market()}
      timelinePoints={[
        point("2026-07-20T10:00:00.000Z", "100.00"),
        point("2026-07-20T10:02:00.000Z", "102.00"),
      ]}
      timelineAnomalies={[]}
      isSummaryLoading={false}
      isTimelineLoading={false}
      timelineErrorMessage={null}
      onRetryTimeline={vi.fn()}
      emptyAnchorMs={emptyAnchorMs}
      {...extra}
    />,
  );
}

beforeEach(() => {
  tooltipProps = {};
});

describe("TimelinePanel render-state matrix", () => {
  it("gives summary loading precedence and preserves the no-market presentation", () => {
    const loading = mount({
      isSummaryLoading: true,
      selectedMarket: null,
      isTimelineLoading: true,
      timelineErrorMessage: "hidden",
    });
    expect(loading.container.querySelector(".h-40")).not.toBeNull();
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    loading.unmount();

    mount({ selectedMarket: null, timelinePoints: [], timelineAnomalies: [] });
    for (const text of [
      "Unknown market",
      "No data yet",
      "Waiting for market data",
      "No current market state available for this market.",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it.each([
    ["configured", "Configured", "Configured for Live; Live ingestion is not active."],
    ["awaiting", "Awaiting data", "Awaiting first Live market data."],
    ["unavailable", "Unavailable", "Live market data is unavailable."],
  ] as const)(
    "preserves the %s state before timeline resource states",
    (availability, status, message) => {
      mount({
        selectedMarket: market({ availability, state: null, health: null }),
        isTimelineLoading: true,
        timelineErrorMessage: "hidden",
        timelineAnomalies: [
          anomaly(availability, "critical", "2026-07-20T10:01:00.000Z"),
        ],
      });
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getAllByText(message)).toHaveLength(2);
      expect(screen.queryByText("hidden")).not.toBeInTheDocument();
      expect(screen.queryByText("Critical anomaly")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    },
  );

  it("orders observed error before loading, normalized-empty, and chart states", () => {
    const retry = vi.fn();
    const error = mount({
      timelineErrorMessage: "transport failed",
      isTimelineLoading: true,
      onRetryTimeline: retry,
    });
    expect(screen.getByText("Market timeline unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    error.unmount();

    const loading = mount({ timelinePoints: [], isTimelineLoading: true });
    expect(loading.container.querySelector(".h-\\[320px\\]")).not.toBeNull();
    expect(screen.queryByText("Waiting for market data")).not.toBeInTheDocument();
    loading.unmount();

    const empty = mount({
      timelinePoints: [
        point("invalid", "100"),
        point("2026-07-20T10:00:00.000Z", " "),
      ],
    });
    expect(screen.getByText("Waiting for market data")).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
    empty.unmount();

    mount();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
  });
});

describe("TimelinePanel chart, tooltip, and snapshot parity", () => {
  it("uses accepted normalization and exact domains with magnitude padding", () => {
    mount({
      selectedMarket: market({ source: "demo" }),
      timelinePoints: [
        point("2026-07-20T10:02:00.000Z", "102"),
        point("invalid", "999"),
        point("2026-07-20T10:00:00.000Z", "100"),
        point("2026-07-20T10:01:00.000Z", "NaN"),
      ],
      timelineAnomalies: [
        anomaly("1", "info", "2026-07-20T10:00:30.000Z"),
        anomaly("2", "warning", "2026-07-20T10:01:00.000Z"),
        anomaly("3", "critical", "2026-07-20T09:59:59.999Z"),
        anomaly("4", "critical", "invalid"),
      ],
    });

    expect(screen.getByText("Demo")).toBeInTheDocument();
    expect(screen.getByText("Critical anomaly")).toBeInTheDocument();
    expect(
      JSON.parse(screen.getByTestId("chart").getAttribute("data-data") ?? "[]"),
    ).toHaveLength(2);
    expect(screen.getByTestId("x-axis")).toHaveAttribute(
      "data-domain",
      JSON.stringify([
        Date.parse("2026-07-20T10:00:00.000Z"),
        Date.parse("2026-07-20T10:02:00.000Z"),
      ]),
    );

    const exactPriceDomain = [99.796, 102.204];
    expect(screen.getByTestId("y-axis")).toHaveAttribute(
      "data-domain",
      JSON.stringify(exactPriceDomain),
    );
    expect(102 * 0.002).toBeGreaterThan(2 * 0.08);
    expect(exactPriceDomain).toEqual([100 - 102 * 0.002, 102 + 102 * 0.002]);

    expect(
      screen
        .getAllByTestId("reference-line")
        .map((line) => line.getAttribute("data-stroke")),
    ).toEqual(["#63A7FF", "#F5C542"]);
    expect(screen.getByTestId("area").getAttribute("data-props")).toContain(
      '"isAnimationActive":false',
    );
  });

  it("preserves tooltip facts, zero values, and inclusive ±15-second matching", () => {
    const timestamp = "2026-07-20T10:01:00.000Z";
    tooltipProps = {
      active: true,
      label: Date.parse(timestamp),
      payload: [{
        payload: {
          timestamp,
          timestampMs: Date.parse(timestamp),
          price: 101,
          priceLabel: "101.0000",
          spreadPct: 0,
          tradesPerMinute: 0,
          lastEventAgeMs: 0,
        },
      }],
    };
    mount({
      timelineAnomalies: [
        anomaly("1", "warning", "2026-07-20T10:01:15.000Z"),
        anomaly("2", "critical", "2026-07-20T10:01:15.001Z", {
          anomaly_type: "trade_burst",
        }),
      ],
    });

    const tooltip = screen.getByTestId("tooltip");
    for (const text of [
      "Price: 101.0000",
      "Spread: 0.00%",
      "Trades/min: 0",
      "Freshness: 0 ms",
      "Anomalies: Spread Spike (Warning)",
    ]) {
      expect(within(tooltip).getByText(text)).toBeInTheDocument();
    }
    expect(within(tooltip).queryByText(/Trade Burst/)).not.toBeInTheDocument();
  });

  it("preserves the source badge and selected-market snapshot metrics", () => {
    mount({
      selectedMarket: market({
        state: {
          last_trade_price: "0",
          best_bid_price: "0",
          best_ask_price: "0",
          spread_pct: 0,
          price_change_1m_pct: 0,
          trades_per_minute: 0,
          last_event_time: "2026-07-20T10:02:00.000Z",
          last_event_age_ms: 0,
          depth_sequence_gap_count: 0,
        },
        health: {
          score: 50,
          status: "degraded",
          recent_anomaly_count: 0,
          evaluated_at: "2026-07-20T10:02:01.000Z",
        },
      }),
    });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    for (const [label, value] of [
      ["Price", "0"],
      ["Spread", "0.00%"],
      ["Trades/min", "0"],
      ["Freshness", "0 ms"],
    ]) {
      expect(
        within(screen.getByText(label).parentElement as HTMLElement).getByText(value),
      ).toBeInTheDocument();
    }
  });
});

describe("TimelinePanel deterministic ownership and scope", () => {
  it("uses explicit time, never reads current time, and does not mutate inputs", () => {
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(999);
    const selected = Object.freeze(market());
    const timelinePoint = Object.freeze(point("2026-07-20T10:00:00.000Z", "100"));
    const timelineAnomaly = Object.freeze(
      anomaly("1", "warning", "2026-07-20T10:00:00.000Z"),
    );
    const timelinePoints = Object.freeze([timelinePoint]);
    const timelineAnomalies = Object.freeze([timelineAnomaly]);
    const before = JSON.stringify({ selected, timelinePoints, timelineAnomalies });

    const first = mount({
      selectedMarket: selected,
      timelinePoints,
      timelineAnomalies,
      emptyAnchorMs,
    });
    const firstEvidence = [
      screen.getByTestId("chart").getAttribute("data-data"),
      screen.getByTestId("x-axis").getAttribute("data-domain"),
      screen.getByTestId("y-axis").getAttribute("data-domain"),
    ];
    first.unmount();

    mount({
      selectedMarket: selected,
      timelinePoints,
      timelineAnomalies,
      emptyAnchorMs,
    });
    expect([
      screen.getByTestId("chart").getAttribute("data-data"),
      screen.getByTestId("x-axis").getAttribute("data-domain"),
      screen.getByTestId("y-axis").getAttribute("data-domain"),
    ]).toEqual(firstEvidence);
    expect(dateNow).not.toHaveBeenCalled();
    expect(JSON.stringify({ selected, timelinePoints, timelineAnomalies })).toBe(before);

    mount({ timelinePoints: [], emptyAnchorMs });
    expect(dateNow).not.toHaveBeenCalled();
  });

  it("preserves current classes/copy, accepted owners, and forbidden boundaries", () => {
    const { container } = mount();
    expect(
      container.querySelector(
        ".lg\\:grid-cols-\\[minmax\\(0\\,1fr\\)_248px\\]",
      ),
    ).not.toBeNull();
    expect(container.querySelector("aside.min-h-\\[285px\\]")).not.toBeNull();

    expect(componentSource).toMatch(/export type TimelinePanelProps = Readonly<\{/);
    expect(componentSource).toMatch(
      /import\s+\{\s*buildTimelineDomains\s*\}\s+from\s+["']\.\/timelineDomains["'];/,
    );
    expect(componentSource).toMatch(
      /normalizeTimelinePoints[\s\S]*from\s+["']\.\/timelineNormalization["'];/,
    );
    expect(componentSource).toContain(
      "buildTimelineDomains(normalizedTimelinePoints, emptyAnchorMs)",
    );
    for (const text of [
      'id="marketTimelineFill"',
      'stroke="#7EE45B"',
      "isAnimationActive={false}",
      "Market timeline unavailable",
      "Waiting for market data",
    ]) {
      expect(componentSource).toContain(text);
    }

    expect(componentSource).not.toMatch(
      /\bDate\.now\s*\(|\bnew Date\(\s*\)|\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|Math\.random)\b/,
    );
    expect(componentSource).not.toMatch(
      /from\s+["'][^"']*(?:api|query|router|routing|popup|storage)[^"']*["']/i,
    );
    expect(componentSource).not.toMatch(/\buse[A-Z][A-Za-z0-9]*\s*\(|\breplay\b/i);
    expect(componentSource).not.toMatch(
      /function\s+(?:buildTimeline(?:Price|Time)?Domain|normalizeTimeline)/,
    );
    expect(dashboardPageSource).not.toMatch(
      /(?:import[\s\S]*TimelinePanel|<TimelinePanel\b)/,
    );
  });
});

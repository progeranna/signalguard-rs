import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimelinePanel, type TimelinePanelProps } from "./TimelinePanel";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
  MarketTimelinePoint,
} from "./types";

let tooltipProps: Record<string, unknown> = {};

vi.mock("recharts", () => ({
  ResponsiveContainer: ({
    children,
    height,
    width,
  }: {
    children: ReactNode;
    height: string | number;
    width: string | number;
  }) => (
    <div
      data-testid="responsive-container"
      data-height={String(height)}
      data-width={String(width)}
    >
      {children}
    </div>
  ),
  AreaChart: ({
    children,
    data,
    margin,
  }: {
    children: ReactNode;
    data: unknown;
    margin: unknown;
  }) => (
    <div
      data-testid="chart"
      data-data={JSON.stringify(data)}
      data-margin={JSON.stringify(margin)}
    >
      {children}
    </div>
  ),
  CartesianGrid: (props: Record<string, unknown>) => (
    <div data-testid="grid" data-props={JSON.stringify(props)} />
  ),
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
        ? cloneElement(
            content as ReactElement<Record<string, unknown>>,
            tooltipProps,
          )
        : null}
    </div>
  ),
}));

const componentSource = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/TimelinePanel.tsx"),
  "utf8",
);
const emptyAnchorMs = Date.parse("2026-07-20T10:05:00.000Z");

function staticImportSpecifiers(value: string): string[] {
  return Array.from(
    value.matchAll(/\bfrom\s+["']([^"']+)["']/g),
    (match) => match[1],
  );
}

function isForbiddenOwnershipImport(specifier: string): boolean {
  return (
    specifier.startsWith("@tanstack/") ||
    specifier.startsWith("react-router") ||
    specifier === "./api" ||
    specifier === "./queryKeys" ||
    specifier.includes("symbolPopup") ||
    specifier.includes("symbolMarketResource") ||
    specifier.includes("selectedSymbol") ||
    specifier.includes("shared/api/client")
  );
}

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

function chartEvidence(): Array<string | null> {
  return [
    screen.getByTestId("chart").getAttribute("data-data"),
    screen.getByTestId("x-axis").getAttribute("data-domain"),
    screen.getByTestId("y-axis").getAttribute("data-domain"),
  ];
}

function snapshotValue(label: string): HTMLElement {
  const labelElement = screen.getByText(label);
  const metric = labelElement.parentElement;

  if (!metric) {
    throw new Error(`Missing metric container for ${label}`);
  }

  return metric;
}

beforeEach(() => {
  tooltipProps = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TimelinePanel render-state matrix", () => {
  it("gives summary loading precedence", () => {
    const loading = mount({
      isSummaryLoading: true,
      selectedMarket: null,
      isTimelineLoading: true,
      timelineErrorMessage: "hidden",
    });

    const skeleton = loading.container.querySelector("section > div");
    expect(skeleton?.classList.contains("h-40")).toBe(true);
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("preserves the no-selected-market presentation", () => {
    mount({ selectedMarket: null, timelinePoints: [], timelineAnomalies: [] });

    for (const text of [
      "Unknown market",
      "No data yet",
      "Waiting for market data",
      "No current market state available for this market.",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
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
    const loadingSkeleton = Array.from(
      loading.container.querySelectorAll("div"),
    ).find((element) => element.classList.contains("h-[320px]"));
    expect(loadingSkeleton).toBeDefined();
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
    expect(screen.getByTestId("responsive-container")).toHaveAttribute(
      "data-width",
      "100%",
    );
    expect(screen.getByTestId("responsive-container")).toHaveAttribute(
      "data-height",
      "100%",
    );
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
    const rangePadding = (102 - 100) * 0.08;
    const magnitudePadding = 102 * 0.002;
    expect(magnitudePadding).toBeGreaterThan(rangePadding);
    expect(exactPriceDomain).toEqual([
      100 - magnitudePadding,
      102 + magnitudePadding,
    ]);
    expect(screen.getByTestId("y-axis")).toHaveAttribute(
      "data-domain",
      JSON.stringify(exactPriceDomain),
    );

    expect(
      screen
        .getAllByTestId("reference-line")
        .map((line) => [
          line.getAttribute("data-x"),
          line.getAttribute("data-stroke"),
        ]),
    ).toEqual([
      [String(Date.parse("2026-07-20T10:00:30.000Z")), "#63A7FF"],
      [String(Date.parse("2026-07-20T10:01:00.000Z")), "#F5C542"],
    ]);
    expect(screen.getByTestId("chart")).toHaveAttribute(
      "data-margin",
      JSON.stringify({ top: 4, right: 14, bottom: 2, left: 0 }),
    );
    expect(screen.getByTestId("area").getAttribute("data-props")).toContain(
      '"isAnimationActive":false',
    );
    expect(screen.getByTestId("grid").getAttribute("data-props")).toContain(
      '"vertical":false',
    );
  });

  it("matches anomalies inclusively at both ±15-second boundaries", () => {
    const timestamp = "2026-07-20T10:01:00.000Z";
    tooltipProps = {
      active: true,
      label: Date.parse(timestamp),
      payload: [
        {
          payload: {
            timestamp,
            timestampMs: Date.parse(timestamp),
            price: 101,
            priceLabel: "101.0000",
            spreadPct: 0,
            tradesPerMinute: 0,
            lastEventAgeMs: 0,
          },
        },
      ],
    };

    mount({
      timelineAnomalies: [
        anomaly("before", "warning", "2026-07-20T10:00:45.000Z", {
          anomaly_type: "price_move",
        }),
        anomaly("after", "critical", "2026-07-20T10:01:15.000Z"),
        anomaly("too-early", "info", "2026-07-20T10:00:44.999Z", {
          anomaly_type: "quote_stuck",
        }),
        anomaly("too-late", "info", "2026-07-20T10:01:15.001Z", {
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
      "Anomalies: Price Move (Warning), Spread Spike (Critical)",
    ]) {
      expect(within(tooltip).getByText(text)).toBeInTheDocument();
    }
    expect(within(tooltip).queryByText(/Quote Stuck/)).not.toBeInTheDocument();
    expect(within(tooltip).queryByText(/Trade Burst/)).not.toBeInTheDocument();
  });

  it("preserves source, status, zero values, and missing snapshot fallbacks", () => {
    const zeroMarket = market({
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
    });
    const view = mount({ selectedMarket: zeroMarket });

    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    for (const [label, value] of [
      ["Price", "0"],
      ["Spread", "0.00%"],
      ["Trades/min", "0"],
      ["Freshness", "0 ms"],
    ]) {
      expect(within(snapshotValue(label)).getByText(value)).toBeInTheDocument();
    }

    view.rerender(
      <TimelinePanel
        selectedMarket={market({ state: null })}
        timelinePoints={[]}
        timelineAnomalies={[]}
        isSummaryLoading={false}
        isTimelineLoading={false}
        timelineErrorMessage={null}
        onRetryTimeline={vi.fn()}
        emptyAnchorMs={emptyAnchorMs}
      />,
    );

    expect(within(snapshotValue("Price")).getByText("—")).toBeInTheDocument();
    expect(within(snapshotValue("Spread")).getByText("—")).toBeInTheDocument();
    expect(within(snapshotValue("Trades/min")).getByText("—")).toBeInTheDocument();
    expect(
      within(snapshotValue("Freshness")).getByText("Unavailable"),
    ).toBeInTheDocument();
  });
});

describe("TimelinePanel deterministic ownership and scope", () => {
  it("delegates normalization and domain derivation through their public modules", async () => {
    const timelinePoints = Object.freeze([
      Object.freeze(point("2026-07-20T10:00:00.000Z", "100.00")),
    ]);
    const before = JSON.stringify(timelinePoints);
    const normalized = Object.freeze([
      Object.freeze({
        timestamp: "2026-07-20T11:00:00.000Z",
        timestampMs: 123_000,
        price: 777,
        priceLabel: "777.0000",
        spreadPct: 0.25,
        tradesPerMinute: 9,
        lastEventAgeMs: 12,
      }),
    ]);
    const domains = Object.freeze({
      price: Object.freeze([700, 800] as const),
      time: Object.freeze([120_000, 126_000] as const),
    });
    const normalizeTimelinePoints = vi.fn(() => normalized);
    const buildTimelineDomains = vi.fn(() => domains);

    vi.resetModules();
    vi.doMock("./timelineNormalization", () => ({ normalizeTimelinePoints }));
    vi.doMock("./timelineDomains", () => ({ buildTimelineDomains }));

    try {
      const { TimelinePanel: DelegatingTimelinePanel } = await import(
        "./TimelinePanel"
      );
      render(
        <DelegatingTimelinePanel
          selectedMarket={market()}
          timelinePoints={timelinePoints}
          timelineAnomalies={[]}
          isSummaryLoading={false}
          isTimelineLoading={false}
          timelineErrorMessage={null}
          onRetryTimeline={vi.fn()}
          emptyAnchorMs={emptyAnchorMs}
        />,
      );

      expect(normalizeTimelinePoints).toHaveBeenCalledOnce();
      expect(normalizeTimelinePoints).toHaveBeenCalledWith(timelinePoints);
      expect(buildTimelineDomains).toHaveBeenCalledOnce();
      expect(buildTimelineDomains).toHaveBeenCalledWith(
        [...normalized],
        emptyAnchorMs,
      );
      expect(screen.getByTestId("chart")).toHaveAttribute(
        "data-data",
        JSON.stringify(normalized),
      );
      expect(screen.getByTestId("x-axis")).toHaveAttribute(
        "data-domain",
        JSON.stringify(domains.time),
      );
      expect(screen.getByTestId("y-axis")).toHaveAttribute(
        "data-domain",
        JSON.stringify(domains.price),
      );
      expect(JSON.stringify(timelinePoints)).toBe(before);
    } finally {
      vi.doUnmock("./timelineNormalization");
      vi.doUnmock("./timelineDomains");
      vi.resetModules();
    }
  });

  it("does not attribute React renderer Date.now calls to the component", () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(111)
      .mockReturnValue(222);
    const selectedValue = market();
    if (!selectedValue.state || !selectedValue.health) {
      throw new Error("Observed market fixture must include state and health");
    }
    const selectedState = Object.freeze({ ...selectedValue.state });
    const selectedHealth = Object.freeze({ ...selectedValue.health });
    const selected = Object.freeze(
      market({ state: selectedState, health: selectedHealth }),
    );
    const timelinePoint = Object.freeze(
      point("2026-07-20T10:00:00.000Z", "100"),
    );
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
    const firstEvidence = chartEvidence();
    first.unmount();

    dateNow.mockReturnValue(333);
    mount({
      selectedMarket: selected,
      timelinePoints,
      timelineAnomalies,
      emptyAnchorMs,
    });

    // WEB2 incorrectly required zero global Date.now calls. React's renderer
    // makes those calls itself, so the component boundary is proved by stable
    // output under changing clock values plus the direct source guard below.
    expect(dateNow).toHaveBeenCalled();
    expect(chartEvidence()).toEqual(firstEvidence);
    expect(JSON.stringify({ selected, timelinePoints, timelineAnomalies })).toBe(
      before,
    );
  });

  it("uses the explicit empty anchor and remains deterministic for empty input", () => {
    const first = mount({ timelinePoints: [], emptyAnchorMs });
    expect(screen.getByText("Waiting for market data")).toBeInTheDocument();
    const firstHtml = first.container.innerHTML;
    first.unmount();

    const second = mount({ timelinePoints: [], emptyAnchorMs });
    expect(second.container.innerHTML).toBe(firstHtml);
  });

  it("preserves current layout and rejects explicit forbidden ownership", () => {
    const { container } = mount();
    const layout = container.querySelector("section > div");
    const snapshot = container.querySelector("aside");
    const importSources = staticImportSpecifiers(componentSource);

    expect(
      layout?.classList.contains("lg:grid-cols-[minmax(0,1fr)_248px]"),
    ).toBe(true);
    expect(snapshot?.classList.contains("min-h-[285px]")).toBe(true);
    expect(componentSource).toMatch(/export type TimelinePanelProps = Readonly<\{/);
    expect(importSources.filter(isForbiddenOwnershipImport)).toEqual([]);
    expect(componentSource).not.toMatch(
      /\b(?:Date\.now\s*\(|new\s+Date\s*\(\s*\)|fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|Math\.random|window|document|navigator)\b/,
    );
    expect(componentSource).not.toMatch(
      /\buse(?:Query|Mutation|Navigate|Location|Params|SymbolPopupResource|SymbolMarketResource)\s*\(/,
    );
    expect(componentSource).not.toMatch(/\bReplay\b|["']replay["']/);
    expect(componentSource).not.toMatch(
      /function\s+(?:buildTimeline(?:Price|Time)?Domain|normalizeTimeline)/,
    );
  });
});

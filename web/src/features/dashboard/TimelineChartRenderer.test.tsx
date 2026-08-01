import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  TimelineChartRenderer,
  type TimelineChartRendererProps,
} from "./TimelineChartRenderer";
import type { NormalizedTimelinePoint } from "./timelineNormalization";
import type { DashboardAnomaly } from "./types";

const start = Date.parse("2026-07-20T10:00:00.000Z");

function point(
  offsetMs: number,
  price: number,
  extra: Partial<NormalizedTimelinePoint> = {},
): NormalizedTimelinePoint {
  const timestampMs = start + offsetMs;

  return {
    timestamp: new Date(timestampMs).toISOString(),
    timestampMs,
    price,
    priceLabel: price.toFixed(4),
    spreadPct: 0.02,
    tradesPerMinute: 42,
    lastEventAgeMs: 250,
    ...extra,
  };
}

function anomaly(
  id: string,
  offsetMs: number,
  severity: DashboardAnomaly["severity"] = "warning",
  anomalyType = "spread_spike",
): DashboardAnomaly {
  const timestamp = new Date(start + offsetMs).toISOString();

  return {
    id,
    symbol: "BTCUSDT",
    anomaly_type: anomalyType,
    severity,
    message: "Observed anomaly",
    observed_value: 1,
    threshold_value: 0.5,
    event_time: timestamp,
    created_at: timestamp,
  };
}

const points = [point(0, 100), point(60_000, 101), point(120_000, 102)];
const domains = {
  time: [start, start + 120_000] as const,
  price: [99, 103] as const,
};

function mount(extra: Partial<TimelineChartRendererProps> = {}) {
  return render(
    <TimelineChartRenderer
      points={points}
      anomalies={[]}
      visibleAnomalies={[]}
      domains={domains}
      {...extra}
    />,
  );
}

describe("TimelineChartRenderer", () => {
  it("renders the responsive native SVG presentation and stable dimensions", () => {
    mount();

    const wrapper = screen.getByTestId("responsive-container");
    const chart = screen.getByRole("img", { name: "Market timeline chart" });
    expect(wrapper).toHaveClass("relative", "h-[285px]", "w-full");
    expect(wrapper).toHaveAttribute("data-width", "100%");
    expect(wrapper).toHaveAttribute("data-height", "100%");
    expect(chart).toHaveAttribute("preserveAspectRatio", "none");
    expect(chart).toHaveAttribute("viewBox", "0 0 1000 320");
    expect(screen.getByTestId("price-line")).toHaveAttribute(
      "stroke",
      "#7EE45B",
    );
    expect(screen.getByTestId("area")).toHaveAttribute(
      "fill",
      "url(#marketTimelineFill)",
    );
    expect(screen.getByText("Time")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
  });

  it("renders only supplied visible markers with severity colors", () => {
    const info = { ...anomaly("info", 30_000, "info"), timestampMs: start + 30_000 };
    const warning = {
      ...anomaly("warning", 60_000, "warning"),
      timestampMs: start + 60_000,
    };
    const critical = {
      ...anomaly("critical", 90_000, "critical"),
      timestampMs: start + 90_000,
    };

    mount({
      anomalies: [info, warning, critical, anomaly("outside", 180_000)],
      visibleAnomalies: [info, warning, critical],
    });

    expect(
      screen
        .getAllByTestId("reference-line")
        .map((marker) => marker.getAttribute("data-stroke")),
    ).toEqual(["#63A7FF", "#F5C542", "#FF6B5F"]);
  });

  it("matches tooltip anomalies inclusively at both 15-second boundaries", () => {
    mount({
      points: [
        point(60_000, 101, {
          priceLabel: "101.0000",
          spreadPct: 0,
          tradesPerMinute: 0,
          lastEventAgeMs: 0,
        }),
      ],
      anomalies: [
        anomaly("before", 45_000, "warning", "price_move"),
        anomaly("after", 75_000, "critical"),
        anomaly("too-early", 44_999, "info", "quote_stuck"),
        anomaly("too-late", 75_001, "info", "trade_burst"),
      ],
    });

    fireEvent.focus(screen.getByRole("img"));
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveTextContent("Price: 101.0000");
    expect(tooltip).toHaveTextContent("Spread: 0.00%");
    expect(tooltip).toHaveTextContent("Trades/min: 0");
    expect(tooltip).toHaveTextContent("Freshness: 0 ms");
    expect(tooltip).toHaveTextContent(
      "Anomalies: Price Move (Warning), Spread Spike (Critical)",
    );
    expect(tooltip).not.toHaveTextContent("Quote Stuck");
    expect(tooltip).not.toHaveTextContent("Trade Burst");
  });

  it("omits missing optional tooltip values without hiding zero values", () => {
    mount({
      points: [
        point(0, 0, {
          priceLabel: "0",
          spreadPct: null,
          tradesPerMinute: null,
          lastEventAgeMs: null,
        }),
      ],
    });

    fireEvent.focus(screen.getByRole("img"));
    const tooltip = screen.getByTestId("tooltip");
    expect(tooltip).toHaveTextContent("Price: 0");
    expect(tooltip).not.toHaveTextContent("Spread:");
    expect(tooltip).not.toHaveTextContent("Trades/min:");
    expect(tooltip).not.toHaveTextContent("Freshness:");
  });

  it("navigates first, middle, and last points and dismisses with Escape", () => {
    mount();
    const chart = screen.getByRole("img");

    fireEvent.focus(chart);
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 100.0000");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 101.0000");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 102.0000");
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 101.0000");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
  });

  it("selects the nearest point with pointer movement and clears on leave", () => {
    mount();
    const chart = screen.getByRole("img");
    Object.defineProperty(chart, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, width: 1_000 }),
    });

    fireEvent.mouseMove(chart, { clientX: 522 });
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 101.0000");
    fireEvent.mouseLeave(chart);
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
  });

  it("keeps the renderer mounted and interaction state across parent rerenders", () => {
    const view = mount();
    const initialChart = screen.getByRole("img");
    fireEvent.focus(initialChart);
    fireEvent.keyDown(initialChart, { key: "ArrowRight" });

    view.rerender(
      <TimelineChartRenderer
        points={points}
        anomalies={[]}
        visibleAnomalies={[]}
        domains={domains}
      />,
    );

    expect(screen.getByRole("img")).toBe(initialChart);
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Price: 101.0000");
  });

  it("keeps all tooltip information available through focus", () => {
    mount({ anomalies: [anomaly("one", 0)] });
    const chart = screen.getByRole("img");
    fireEvent.focus(chart);

    expect(within(screen.getByTestId("tooltip")).getByText(/Anomalies:/)).toBeInTheDocument();
    fireEvent.blur(chart);
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
  });
});

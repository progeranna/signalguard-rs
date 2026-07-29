import { readFileSync } from "node:fs";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MarketDetailViewModel } from "./marketViewModel";
import { SymbolDetailMetrics } from "./SymbolDetailMetrics";

const metricValues = {
  bestAsk: "ASK-VALUE",
  bestBid: "BID-VALUE",
  depthGaps: "GAPS-VALUE",
  freshness: "FRESH-VALUE",
  lastPrice: "PRICE-VALUE",
  lastEvent: "EVENT-VALUE",
  anomalyCount: "ANOMALY-VALUE",
  priceMove: "MOVE-VALUE",
  spread: "SPREAD-VALUE",
  tradesPerMinute: "TRADES-VALUE",
} as const;

function fixture(
  overrides: Partial<
    Pick<
      MarketDetailViewModel,
      "anomalies" | "availability" | "metrics" | "stateAvailable" | "status"
    >
  > = {},
): MarketDetailViewModel {
  return {
    identity: { mode: "demo", symbol: "BTCUSDT" as MarketDetailViewModel["identity"]["symbol"] },
    source: "demo",
    availability: "observed",
    status: { text: "Healthy status", tone: "healthy" },
    healthScore: "HEALTH-VALUE",
    stateAvailable: true,
    metrics: metricValues,
    anomalies: [],
    ...overrides,
  };
}

function labelsIn(container: HTMLElement, selector: string): string[] {
  return Array.from(container.querySelectorAll(selector)).map((element) =>
    element.textContent?.trim() ?? "",
  );
}

describe("SymbolDetailMetrics", () => {
  it("preserves route strip order, labels, values, and responsive layout", () => {
    const { container } = render(
      <SymbolDetailMetrics surface="route-strip" viewModel={fixture()} />,
    );
    const strip = container.firstElementChild as HTMLElement;

    expect(strip).toHaveClass("md:grid-cols-5");
    expect(labelsIn(strip, "div > p:first-child")).toEqual([
      "Health",
      "Last price",
      "Spread",
      "Trades/min",
      "Freshness",
    ]);
    expect(strip).toHaveTextContent("HEALTH-VALUE");
    expect(strip).toHaveTextContent("PRICE-VALUE");
    expect(strip).toHaveTextContent("SPREAD-VALUE");
    expect(strip).toHaveTextContent("TRADES-VALUE");
    expect(strip).toHaveTextContent("FRESH-VALUE");
  });

  it("preserves route Signal Preview and Current Market State order", () => {
    const { container } = render(
      <SymbolDetailMetrics surface="route-state" viewModel={fixture()} />,
    );
    const panels = container.firstElementChild as HTMLElement;
    const signal = panels.firstElementChild as HTMLElement;
    const state = panels.lastElementChild as HTMLElement;
    const recentAnomaliesRow = within(signal).getByText("Recent anomalies")
      .parentElement as HTMLElement;

    expect(screen.getByText("Signal Preview")).toBeInTheDocument();
    expect(screen.getByText("Current Market State")).toBeInTheDocument();
    expect(labelsIn(signal, "dt")).toEqual([
      "Market status",
      "Recent anomalies",
      "Price move (1m)",
      "Depth sequence gaps",
    ]);
    expect(labelsIn(state, "dt")).toEqual([
      "Last trade price",
      "Best bid",
      "Best ask",
      "Spread",
      "Trades/min",
      "Last event",
      "Freshness",
      "Depth gap count",
    ]);
    expect(within(recentAnomaliesRow).getByText("0")).toBeInTheDocument();
    expect(within(recentAnomaliesRow).queryByText("ANOMALY-VALUE")).not.toBeInTheDocument();
    expect(signal).toHaveTextContent("MOVE-VALUE");
    expect(signal).toHaveTextContent("GAPS-VALUE");
    expect(state).toHaveTextContent("PRICE-VALUE");
    expect(state).toHaveTextContent("BID-VALUE");
    expect(state).toHaveTextContent("ASK-VALUE");
    expect(state).toHaveTextContent("SPREAD-VALUE");
    expect(state).toHaveTextContent("TRADES-VALUE");
    expect(state).toHaveTextContent("EVENT-VALUE");
    expect(state).toHaveTextContent("FRESH-VALUE");
  });

  it("renders popup cards in the required eight-card order", () => {
    const { container } = render(
      <SymbolDetailMetrics surface="popup" viewModel={fixture()} />,
    );
    const grid = container.firstElementChild as HTMLElement;

    expect(grid).toHaveClass("sm:grid-cols-2", "xl:grid-cols-4");
    expect(labelsIn(grid, "div > p:first-child")).toEqual([
      "Health",
      "Price",
      "Spread",
      "Trades/min",
      "Freshness",
      "Anomalies",
      "Best bid",
      "Best ask",
    ]);
    expect(grid).toHaveTextContent("ANOMALY-VALUE");
  });

  it("preserves the route anomaly count format while popup uses the compact metric", () => {
    const anomalies = Object.freeze(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: `adapted-anomaly-${index}`,
        symbol: "BTCUSDT" as MarketDetailViewModel["identity"]["symbol"],
        type: "Spread spike",
        severity: { key: "warning" as const, text: "Warning", tone: "warning" as const },
        observed: { route: "1.5", popup: "1.500%" },
        threshold: { route: "1", popup: "1.000%" },
        detected: "1 min ago",
        detectedAt: "2026-07-29 18:00:00 UTC",
        context: "Adapted anomaly fixture",
        valueClassName: "text-amber-200",
      })),
    );
    const viewModel = fixture({
      metrics: { ...metricValues, anomalyCount: "1K" },
      anomalies,
    });
    const snapshot = JSON.stringify(viewModel);
    const route = render(
      <SymbolDetailMetrics surface="route-state" viewModel={viewModel} />,
    );
    const routeRow = screen.getByText("Recent anomalies").parentElement as HTMLElement;

    expect(within(routeRow).getByText("1,000")).toBeInTheDocument();
    expect(within(routeRow).queryByText("1K")).not.toBeInTheDocument();

    route.unmount();
    render(<SymbolDetailMetrics surface="popup" viewModel={viewModel} />);
    const popupCard = screen.getByText("Anomalies").parentElement as HTMLElement;

    expect(within(popupCard).getByText("1K")).toBeInTheDocument();
    expect(JSON.stringify(viewModel)).toBe(snapshot);
    expect(viewModel.anomalies).toBe(anomalies);
    expect(viewModel.anomalies).toHaveLength(1_000);
  });

  it.each([
    ["healthy", "text-emerald-200"],
    ["degraded", "text-amber-200"],
    ["unhealthy", "text-orange-200"],
    ["neutral", "text-white"],
  ] as const)("renders the %s health tone without changing the value", (tone, className) => {
    render(
      <SymbolDetailMetrics
        surface="route-strip"
        viewModel={fixture({ status: { text: `${tone} text`, tone } })}
      />,
    );

    const value = screen.getByText("HEALTH-VALUE");
    expect(value).toHaveClass(className);
    expect(value).not.toHaveTextContent(tone);
  });

  it("does not invent current-state values when stateAvailable is false", () => {
    render(
      <SymbolDetailMetrics
        surface="route-state"
        viewModel={fixture({ stateAvailable: false })}
      />,
    );

    const state = screen.getByText("Current Market State").parentElement?.parentElement;
    expect(state).toBeTruthy();
    expect(within(state as HTMLElement).getByText("No current market state available for this market.")).toBeInTheDocument();
    expect(within(state as HTMLElement).queryByText("PRICE-VALUE")).not.toBeInTheDocument();
  });

  it("uses the supplied view model without mutation or owned data dependencies", () => {
    const viewModel = fixture();
    const snapshot = JSON.stringify(viewModel);

    render(<SymbolDetailMetrics surface="popup" viewModel={viewModel} />);

    expect(JSON.stringify(viewModel)).toBe(snapshot);
    const source = readFileSync("src/features/dashboard/SymbolDetailMetrics.tsx", "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:api|query|router|popup|storage)[^"']*["']/i);
    expect(source).not.toMatch(/fetch\s*\(/i);
    expect(source).not.toMatch(/key=\{\s*index\s*\}/);
  });
});

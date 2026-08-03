import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
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
  availability: MarketDetailViewModel["availability"] = "observed",
): MarketDetailViewModel {
  return {
    identity: {
      mode: "demo",
      symbol: "BTCUSDT" as MarketDetailViewModel["identity"]["symbol"],
    },
    source: "demo",
    availability,
    status: { text: "Healthy", tone: "healthy" },
    healthScore: "HEALTH-VALUE",
    stateAvailable: availability === "observed",
    metrics: metricValues,
    anomalies: [],
  };
}

describe("SymbolDetailMetrics popup-only presentation", () => {
  it("renders the accepted eight-card metric order", () => {
    const { container } = render(
      <SymbolDetailMetrics viewModel={fixture()} />,
    );
    const labels = Array.from(container.querySelectorAll("div > p:first-child"))
      .map((node) => node.textContent);
    expect(labels).toEqual([
      "Health",
      "Price",
      "Spread",
      "Trades/min",
      "Freshness",
      "Anomalies",
      "Best bid",
      "Best ask",
    ]);
    expect(container.firstElementChild).toHaveClass("sm:grid-cols-2", "xl:grid-cols-4");
    for (const value of [
      "HEALTH-VALUE",
      "PRICE-VALUE",
      "SPREAD-VALUE",
      "TRADES-VALUE",
      "FRESH-VALUE",
      "ANOMALY-VALUE",
      "BID-VALUE",
      "ASK-VALUE",
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it.each([
    ["configured", "Configured for Live; Live ingestion is not active."],
    ["awaiting", "Awaiting first Live market data."],
    ["unavailable", "Live market data is unavailable."],
  ] as const)("renders the accepted %s unavailable state", (availability, message) => {
    render(
      <SymbolDetailMetrics viewModel={fixture(availability)} />,
    );
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByText("PRICE-VALUE")).not.toBeInTheDocument();
  });

  it("uses the supplied view model without mutation or external ownership", () => {
    const viewModel = Object.freeze(fixture());
    const snapshot = JSON.stringify(viewModel);
    render(<SymbolDetailMetrics viewModel={viewModel} />);
    expect(JSON.stringify(viewModel)).toBe(snapshot);

    const source = readFileSync("src/features/dashboard/SymbolDetailMetrics.tsx", "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:api|query|router|storage)[^"']*["']/i);
    expect(source).not.toMatch(/fetch\s*\(/);
  });
});

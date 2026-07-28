import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";
import { MarketHealthMobileCards } from "./MarketHealthMobileCards";

const sourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/MarketHealthMobileCards.tsx",
);
const source = readFileSync(sourcePath, "utf8");

function previewRow(
  overrides: Partial<MarketHealthPreviewRow> = {},
): MarketHealthPreviewRow {
  return {
    key: "live:BTCUSDT",
    symbol: "BTCUSDT",
    source: "live",
    availability: "observed",
    observed: true,
    healthScore: 88,
    healthStatus: "healthy",
    lastTradePrice: "65000.00",
    spreadPct: 0.125,
    tradesPerMinute: 120,
    lastEventAgeMs: 750,
    ...overrides,
  };
}

function expectNoObservedMetrics(button: HTMLElement): void {
  for (const label of ["Price", "Spread", "Trades/min", "Age"]) {
    expect(within(button).queryByText(label)).not.toBeInTheDocument();
  }
  expect(button.querySelector(".grid-cols-2")).not.toBeInTheDocument();
  expect(button.querySelector('[style*="width:"]')).not.toBeInTheDocument();
}

describe("MarketHealthMobileCards responsive presentation", () => {
  it("uses the exact mobile-only wrapper classes", () => {
    const { container } = render(
      <MarketHealthMobileCards rows={[]} onOpenSymbolDetail={vi.fn()} />,
    );

    expect(container.firstElementChild).toHaveClass(
      "divide-y",
      "divide-white/10",
      "border-y",
      "border-white/10",
      "lg:hidden",
    );
  });

  it("renders full-width card buttons with exact spacing, hover, and focus classes", () => {
    render(
      <MarketHealthMobileCards
        rows={[previewRow()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    ).toHaveClass(
      "block",
      "w-full",
      "py-4",
      "text-left",
      "transition",
      "hover:bg-white/[0.025]",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-cyan-400/40",
    );
  });
});

describe("MarketHealthMobileCards order, identity, and interaction", () => {
  it("preserves every supplied row in supplied order without limiting", () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      previewRow({
        key: `live:CUSTOM${index}`,
        symbol: `CUSTOM${index}`,
      }),
    ).reverse();

    render(
      <MarketHealthMobileCards rows={rows} onOpenSymbolDetail={vi.fn()} />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual(
      rows.map(({ symbol }) => `Open ${symbol} market detail`),
    );
  });

  it("uses the accepted row key as stable React identity, never array index", () => {
    const first = previewRow({ key: "live:FIRST", symbol: "FIRST" });
    const second = previewRow({ key: "demo:SECOND", symbol: "SECOND", source: "demo" });
    const { rerender } = render(
      <MarketHealthMobileCards
        rows={[first, second]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );
    const firstButton = screen.getByRole("button", {
      name: "Open FIRST market detail",
    });
    const secondButton = screen.getByRole("button", {
      name: "Open SECOND market detail",
    });

    rerender(
      <MarketHealthMobileCards
        rows={[second, first]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const reorderedButtons = screen.getAllByRole("button");
    expect(reorderedButtons[0]).toBe(secondButton);
    expect(reorderedButtons[1]).toBe(firstButton);
    expect(source).toContain("key={row.key}");
    expect(source).not.toMatch(/key=\{(?:index|rowIndex)\}/);
  });

  it("uses the exact accessible label and calls back with the row symbol", () => {
    const onOpenSymbolDetail = vi.fn();
    render(
      <MarketHealthMobileCards
        rows={[previewRow({ symbol: "ETHUSDT", key: "live:ETHUSDT" })]}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Open ETHUSDT market detail",
    });
    fireEvent.click(button);

    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("ETHUSDT");
    expect(within(button).getByText("ETHUSDT")).toHaveClass(
      "font-mono",
      "text-lg",
      "font-bold",
      "text-white",
    );
    expect(within(button).getByText("View market detail")).toBeInTheDocument();
  });

  it("does not mutate rows or synthesize source fallback", () => {
    const live = Object.freeze(previewRow({ key: "live:SAME", symbol: "SAME" }));
    const demo = Object.freeze(
      previewRow({ key: "demo:SAME", symbol: "SAME", source: "demo" }),
    );
    const rows = Object.freeze([live, demo]);
    const before = JSON.stringify(rows);

    render(
      <MarketHealthMobileCards rows={rows} onOpenSymbolDetail={vi.fn()} />,
    );

    expect(screen.getAllByRole("button", { name: "Open SAME market detail" })).toHaveLength(2);
    expect(JSON.stringify(rows)).toBe(before);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });
});

describe("MarketHealthMobileCards observed state", () => {
  it("shows status, score, and all four metrics including numeric zero", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:ZEROUSDT",
            symbol: "ZEROUSDT",
            healthScore: 0,
            healthStatus: "degraded",
            lastTradePrice: "0.0000",
            spreadPct: 0,
            tradesPerMinute: 0,
            lastEventAgeMs: 0,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Open ZEROUSDT market detail",
    });
    expect(within(button).getByText("Degraded")).toBeInTheDocument();
    expect(within(button).getByText("0.0000")).toBeInTheDocument();
    expect(within(button).getByText("0.00%")).toBeInTheDocument();
    expect(within(button).getAllByText("0")).toHaveLength(2);
    expect(within(button).getByText("0 ms")).toBeInTheDocument();
    for (const label of ["Price", "Spread", "Trades/min", "Age"]) {
      expect(within(button).getByText(label)).toBeInTheDocument();
    }
  });

  it("preserves health-score status precedence, tone classes, and minimum bar width", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:STATUSWINS",
            symbol: "STATUSWINS",
            healthScore: 95,
            healthStatus: "degraded",
          }),
          previewRow({
            key: "live:LOWHEALTHY",
            symbol: "LOWHEALTHY",
            healthScore: 2,
            healthStatus: "healthy",
          }),
          previewRow({
            key: "live:UNHEALTHY",
            symbol: "UNHEALTHY",
            healthScore: 20,
            healthStatus: "unhealthy",
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const degraded = screen.getByRole("button", {
      name: "Open STATUSWINS market detail",
    });
    expect(within(degraded).getByText("95")).toHaveClass("text-amber-300");
    expect(degraded.querySelector('[style="width: 95%;"]')).toHaveClass(
      "bg-amber-300",
    );

    const healthy = screen.getByRole("button", {
      name: "Open LOWHEALTHY market detail",
    });
    expect(within(healthy).getByText("2")).toHaveClass("text-emerald-300");
    expect(healthy.querySelector('[style="width: 4%;"]')).toHaveClass(
      "bg-emerald-300",
    );

    const unhealthy = screen.getByRole("button", {
      name: "Open UNHEALTHY market detail",
    });
    expect(within(unhealthy).getByText("20")).toHaveClass("text-rose-300");
    expect(unhealthy.querySelector('[style="width: 20%;"]')).toHaveClass(
      "bg-rose-300",
    );
  });

  it("capitalizes observed status and uses Unknown when absent", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({ key: "live:INFO", symbol: "INFO", healthStatus: "info" }),
          previewRow({ key: "live:UNKNOWN", symbol: "UNKNOWN", healthStatus: null }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(screen.getByText("Info")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});

describe("MarketHealthMobileCards unavailable states", () => {
  it.each([
    ["configured", "Configured", "Configured for Live; Live ingestion is not active."],
    ["awaiting", "Awaiting data", "Awaiting first Live market data."],
    ["unavailable", "Unavailable", "Live market data is unavailable."],
  ] as const)(
    "shows exact %s status/message and omits score and metrics",
    (availability, status, message) => {
      render(
        <MarketHealthMobileCards
          rows={[
            previewRow({
              key: `live:${availability}`,
              symbol: availability.toUpperCase(),
              availability,
              observed: false,
              healthScore: 99,
              healthStatus: "healthy",
              lastTradePrice: "999.00",
              spreadPct: 9,
              tradesPerMinute: 9,
              lastEventAgeMs: 9,
            }),
          ]}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      const button = screen.getByRole("button", {
        name: `Open ${availability.toUpperCase()} market detail`,
      });
      expect(within(button).getByText(status)).toBeInTheDocument();
      expect(within(button).getByText(message)).toHaveClass(
        "border-y",
        "border-white/10",
        "px-2",
        "py-5",
        "text-sm",
        "leading-6",
        "text-slate-400",
      );
      expect(within(button).queryByText("99")).not.toBeInTheDocument();
      expectNoObservedMetrics(button);
    },
  );

  it("keeps the exact observed fallback message without coercing availability", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:OBSERVED-FALLBACK",
            symbol: "OBSERVED-FALLBACK",
            availability: "observed",
            observed: false,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Open OBSERVED-FALLBACK market detail",
    });
    expect(
      within(button).getByText(
        "No current market state available for this market.",
      ),
    ).toBeInTheDocument();
    expectNoObservedMetrics(button);
  });
});

describe("MarketHealthMobileCards scope boundaries", () => {
  it("contains no ordering, limiting, mutation, synthesis, or source fallback logic", () => {
    expect(source).toMatch(
      /import\s+type\s+\{\s*MarketHealthPreviewRow\s*\}\s+from\s+["']\.\/marketHealthPreviewModel["'];/,
    );
    expect(source).not.toMatch(/\brows\.(?:sort|slice|splice|reverse|shift|unshift|push|pop)\s*\(/);
    expect(source).not.toMatch(/\b(?:MARKET_HEALTH_PREVIEW_LIMIT|DashboardSummary|DashboardSymbolSummary)\b/);
    expect(source).not.toMatch(/row\.source|source\s*===|\bDemo\b|\bLive\b\s*:/);
  });

  it("contains no desktop, section-shell, modal, loading, empty-shell, view-all, or Wave 4 markup", () => {
    expect(source).not.toMatch(/<table|<thead|<tbody|<tr|<th|<td/);
    expect(source).not.toMatch(/\b(?:SectionTitle|LoadingSkeleton|Modal|Dialog)\b/);
    expect(source).not.toContain("Market Health");
    expect(source).not.toContain("View all");
    expect(source).not.toContain("No monitored markets available.");
    expect(source).not.toMatch(/Data Age|tooltip|source badge|Wave 4/i);
  });

  it("contains no query, API, router, popup, time, random, or network dependency", () => {
    expect(source).not.toMatch(
      /\b(?:useQuery|queryClient|fetch|XMLHttpRequest|WebSocket|Date\.now|new\s+Date|setTimeout|setInterval|Math\.random|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toMatch(/from\s+["'][^"']*(?:api|router|popup)[^"']*["']/i);
  });
});

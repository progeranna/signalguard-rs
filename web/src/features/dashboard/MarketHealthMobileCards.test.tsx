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

function cardFor(symbol: string): HTMLElement {
  return screen.getByRole("button", {
    name: `Open ${symbol} market detail`,
  });
}

function scoreElement(card: HTMLElement, score: string): HTMLElement {
  return within(card).getByText(score, { selector: "span" });
}

function scoreBar(card: HTMLElement, width: number): HTMLElement {
  const bar = card.querySelector(`[style="width: ${width}%;"]`);
  expect(bar).toBeInTheDocument();
  return bar as HTMLElement;
}

function metricValue(card: HTMLElement, label: string): string | null {
  const labelElement = within(card).getByText(label, { selector: "p" });
  const paragraphs = labelElement.parentElement?.querySelectorAll("p");
  return paragraphs?.[1]?.textContent ?? null;
}

function expectNoObservedMetrics(button: HTMLElement): void {
  for (const label of ["Price", "Spread", "Trades/min", "Age"]) {
    expect(within(button).queryByText(label)).not.toBeInTheDocument();
  }
  expect(button.querySelector(".grid-cols-2")).not.toBeInTheDocument();
  expect(button.querySelector('[style*="width:"]')).not.toBeInTheDocument();
}

describe("MarketHealthMobileCards presentation", () => {
  it("uses the exact mobile-only wrapper and full-width button classes", () => {
    const { container } = render(
      <MarketHealthMobileCards
        rows={[previewRow()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "divide-y divide-white/10 border-y border-white/10 lg:hidden",
    );
    expect(cardFor("BTCUSDT")).toHaveAttribute(
      "class",
      "block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
    );
  });

  it("preserves symbol typography, detail copy, and status badge placement", () => {
    render(
      <MarketHealthMobileCards
        rows={[previewRow()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const card = cardFor("BTCUSDT");
    expect(within(card).getByText("BTCUSDT")).toHaveAttribute(
      "class",
      "font-mono text-lg font-bold text-white",
    );
    expect(within(card).getByText("View market detail")).toHaveAttribute(
      "class",
      "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500",
    );
    const badge = within(card).getByText("Healthy", { selector: "span" });
    expect(badge).toHaveClass(
      "inline-flex",
      "w-fit",
      "shrink-0",
      "border-emerald-400/30",
      "bg-emerald-400/10",
      "text-emerald-100",
    );
    expect(badge.parentElement).toHaveClass(
      "flex",
      "items-start",
      "justify-between",
      "gap-4",
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
      screen
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(rows.map(({ symbol }) => `Open ${symbol} market detail`));
  });

  it("uses accepted row.key identity rather than array position", () => {
    const first = previewRow({ key: "live:FIRST", symbol: "FIRST" });
    const second = previewRow({
      key: "demo:SECOND",
      symbol: "SECOND",
      source: "demo",
    });
    const { rerender } = render(
      <MarketHealthMobileCards
        rows={[first, second]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );
    const firstButton = cardFor("FIRST");
    const secondButton = cardFor("SECOND");

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

    const button = cardFor("ETHUSDT");
    fireEvent.click(button);

    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("ETHUSDT");
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

    expect(
      screen.getAllByRole("button", { name: "Open SAME market detail" }),
    ).toHaveLength(2);
    expect(JSON.stringify(rows)).toBe(before);
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
    expect(screen.queryByText("Demo")).not.toBeInTheDocument();
  });
});

describe("MarketHealthMobileCards observed state", () => {
  it("shows exact score/bar and Price, Spread, Trades/min, and Age formatting", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:FORMAT",
            symbol: "FORMAT",
            healthScore: 88,
            lastTradePrice: "65000.00",
            spreadPct: 0.125,
            tradesPerMinute: 1_234,
            lastEventAgeMs: 1_500,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const card = cardFor("FORMAT");
    expect(scoreElement(card, "88")).toHaveClass(
      "text-lg",
      "font-extrabold",
      "text-emerald-300",
    );
    expect(scoreBar(card, 88)).toHaveClass(
      "h-full",
      "rounded-full",
      "bg-emerald-300",
    );
    expect(metricValue(card, "Price")).toBe("65000.00");
    expect(metricValue(card, "Spread")).toBe("0.13%");
    expect(metricValue(card, "Trades/min")).toBe("1K");
    expect(metricValue(card, "Age")).toBe("1.5 s");
    for (const label of ["Price", "Spread", "Trades/min", "Age"]) {
      expect(within(card).getByText(label)).toHaveClass(
        "text-xs",
        "font-semibold",
        "uppercase",
        "tracking-[0.14em]",
        "text-slate-500",
      );
    }
  });

  it("preserves zero values, missing fallbacks, and minimum score bar width", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:ZERO",
            symbol: "ZERO",
            healthScore: 0,
            healthStatus: null,
            lastTradePrice: "0.0000",
            spreadPct: 0,
            tradesPerMinute: 0,
            lastEventAgeMs: 0,
          }),
          previewRow({
            key: "live:MISSING",
            symbol: "MISSING",
            healthScore: null,
            healthStatus: null,
            lastTradePrice: null,
            spreadPct: null,
            tradesPerMinute: null,
            lastEventAgeMs: null,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const zero = cardFor("ZERO");
    expect(metricValue(zero, "Price")).toBe("0.0000");
    expect(metricValue(zero, "Spread")).toBe("0.00%");
    expect(metricValue(zero, "Trades/min")).toBe("0");
    expect(metricValue(zero, "Age")).toBe("0 ms");
    expect(scoreBar(zero, 4)).toHaveClass("bg-rose-300");

    const missing = cardFor("MISSING");
    expect(scoreElement(missing, "—")).toHaveClass("text-slate-400");
    expect(scoreBar(missing, 0)).toHaveClass("bg-slate-500");
    expect(metricValue(missing, "Price")).toBe("—");
    expect(metricValue(missing, "Spread")).toBe("—");
    expect(metricValue(missing, "Trades/min")).toBe("—");
    expect(metricValue(missing, "Age")).toBe("Unavailable");
  });

  it.each([
    ["DEGRADED95", "degraded", 95, "text-emerald-300", "bg-emerald-300"],
    ["UNHEALTHY90", "unhealthy", 90, "text-emerald-300", "bg-emerald-300"],
    ["HEALTHY2", "healthy", 2, "text-emerald-300", "bg-emerald-300"],
    ["NULL80", null, 80, "text-emerald-300", "bg-emerald-300"],
    ["NULL50", null, 50, "text-amber-300", "bg-amber-300"],
    ["NULL49", null, 49, "text-rose-300", "bg-rose-300"],
    ["NULL0", null, 0, "text-rose-300", "bg-rose-300"],
  ] as const)(
    "applies binding health score precedence for %s",
    (symbol, healthStatus, healthScore, textClass, barClass) => {
      render(
        <MarketHealthMobileCards
          rows={[
            previewRow({
              key: `live:${symbol}`,
              symbol,
              healthStatus,
              healthScore,
            }),
          ]}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      const card = cardFor(symbol);
      expect(scoreElement(card, String(healthScore))).toHaveClass(textClass);
      expect(scoreBar(card, Math.max(healthScore, 4))).toHaveClass(barClass);
    },
  );

  it("keeps degraded status wording while degraded + 95 uses healthy score tone", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:CORRECTED",
            symbol: "CORRECTED",
            healthStatus: "degraded",
            healthScore: 95,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const card = cardFor("CORRECTED");
    expect(within(card).getByText("Degraded", { selector: "span" })).toHaveClass(
      "border-amber-400/30",
      "bg-amber-400/10",
      "text-amber-100",
    );
    expect(scoreElement(card, "95")).toHaveClass("text-emerald-300");
    expect(scoreBar(card, 95)).toHaveClass("bg-emerald-300");
  });

  it("capitalizes accepted observed status and uses Unknown when absent", () => {
    render(
      <MarketHealthMobileCards
        rows={[
          previewRow({
            key: "live:UNHEALTHY",
            symbol: "UNHEALTHY",
            healthStatus: "unhealthy",
          }),
          previewRow({
            key: "live:UNKNOWN",
            symbol: "UNKNOWN",
            healthStatus: null,
          }),
        ]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
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

      const button = cardFor(availability.toUpperCase());
      expect(within(button).getByText(status)).toBeInTheDocument();
      expect(within(button).getByText(message)).toHaveAttribute(
        "class",
        "border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400",
      );
      expect(within(button).queryByText("99")).not.toBeInTheDocument();
      expectNoObservedMetrics(button);
    },
  );

  it("keeps the exact observed fallback message when observed is false", () => {
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

    const button = cardFor("OBSERVED-FALLBACK");
    expect(
      within(button).getByText(
        "No current market state available for this market.",
      ),
    ).toHaveAttribute(
      "class",
      "border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400",
    );
    expectNoObservedMetrics(button);
  });
});

describe("MarketHealthMobileCards scope boundaries", () => {
  it("accepts only the preview model and contains no ordering, limiting, mutation, synthesis, or source fallback", () => {
    expect(source).toMatch(
      /import\s+type\s+\{\s*MarketHealthPreviewRow\s*\}\s+from\s+["']\.\/marketHealthPreviewModel["'];/,
    );
    expect(source).not.toMatch(
      /\brows\.(?:sort|slice|splice|reverse|shift|unshift|push|pop)\s*\(/,
    );
    expect(source).not.toMatch(
      /\b(?:MARKET_HEALTH_PREVIEW_LIMIT|DashboardSummary|DashboardSymbolSummary)\b/,
    );
    expect(source).not.toMatch(/row\.source|source\s*===|\bDemo\b|\bLive\b\s*:/);
  });

  it("contains no desktop, shell, modal, tooltip, source badge, Wave 4, or caller wiring", () => {
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
    expect(source).toMatch(
      /from\s+["']\.\/marketHealthPresentation["'];/,
    );
    expect(source).not.toMatch(
      /from\s+["'][^"']*MarketHealthDesktopTable[^"']*["']/,
    );
  });
});

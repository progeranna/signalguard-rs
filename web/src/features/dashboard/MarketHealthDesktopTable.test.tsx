import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";
import {
  MarketHealthDesktopTable,
  type MarketHealthDesktopTableProps,
} from "./MarketHealthDesktopTable";

const componentSourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/MarketHealthDesktopTable.tsx",
);
const componentSource = readFileSync(componentSourcePath, "utf8");

function previewRow(
  symbol: string,
  overrides: Partial<MarketHealthPreviewRow> = {},
): MarketHealthPreviewRow {
  return {
    key: `live:${symbol}`,
    symbol,
    source: "live",
    availability: "observed",
    observed: true,
    healthScore: 88,
    healthStatus: "healthy",
    lastTradePrice: "100.50",
    spreadPct: 0.5,
    tradesPerMinute: 12,
    lastEventAgeMs: 125,
    ...overrides,
  };
}

function renderTable(
  rows: readonly MarketHealthPreviewRow[],
  onOpenSymbolDetail = vi.fn(),
) {
  const props: MarketHealthDesktopTableProps = {
    rows,
    onOpenSymbolDetail,
  };

  const result = render(<MarketHealthDesktopTable {...props} />);

  return { ...result, onOpenSymbolDetail };
}

function tableRow(symbol: string): HTMLTableRowElement {
  return screen.getByRole("button", {
    name: `Open ${symbol} market detail`,
  }) as HTMLTableRowElement;
}

function rowCells(symbol: string): HTMLElement[] {
  return within(tableRow(symbol)).getAllByRole("cell");
}

describe("MarketHealthDesktopTable structure", () => {
  it("preserves the exact table aria label and six-column order", () => {
    renderTable([]);

    const table = screen.getByRole("table", { name: "Market health" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);

    expect(table).toHaveAttribute("aria-label", "Market health");
    expect(headers).toEqual([
      "Market",
      "Health Score",
      "Last Price",
      "Spread",
      "Trades/min",
      "Status",
    ]);
  });

  it("preserves the exact fixed layout and current colgroup widths", () => {
    renderTable([]);

    const table = screen.getByRole("table", { name: "Market health" });
    const columns = Array.from(table.querySelectorAll("col"));

    expect(table).toHaveClass(
      "w-full",
      "table-fixed",
      "border-collapse",
      "text-left",
    );
    expect(columns).toHaveLength(6);
    expect(columns.map((column) => column.className)).toEqual([
      "w-[18%]",
      "w-[22%]",
      "w-[16%]",
      "w-[11%]",
      "w-[14%]",
      "w-[19%]",
    ]);
  });

  it("preserves the exact desktop-only overflow root classes", () => {
    const { container } = renderTable([]);
    const root = container.firstElementChild;

    expect(root).toHaveClass(
      "hidden",
      "w-full",
      "min-w-0",
      "max-w-full",
      "overflow-x-auto",
      "overscroll-x-contain",
      "border-y",
      "border-white/10",
      "lg:block",
    );
    expect(root).not.toHaveClass("lg:hidden");
  });

  it("preserves the current header, row separator, hover, focus, symbol, and View classes", () => {
    renderTable([previewRow("BTCUSDT")]);

    const headerRow = screen.getAllByRole("row")[0];
    const row = tableRow("BTCUSDT");
    const symbol = within(row).getByText("BTCUSDT");
    const view = within(row).getByText("View");

    expect(headerRow).toHaveClass(
      "border-b",
      "border-white/10",
      "text-xs",
      "font-semibold",
      "uppercase",
      "tracking-[0.14em]",
      "text-slate-500",
    );
    expect(row).toHaveClass(
      "cursor-pointer",
      "border-b",
      "border-white/[0.06]",
      "transition",
      "hover:bg-white/[0.025]",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-cyan-400/40",
      "last:border-0",
    );
    expect(symbol).toHaveClass(
      "min-w-0",
      "truncate",
      "font-mono",
      "text-sm",
      "font-bold",
      "text-slate-50",
    );
    expect(view).toHaveClass(
      "hidden",
      "text-[10px]",
      "font-semibold",
      "uppercase",
      "tracking-[0.14em]",
      "text-slate-500",
      "2xl:inline",
    );
  });
});

describe("MarketHealthDesktopTable row interaction and identity", () => {
  it("renders every supplied row in supplied order without limiting", () => {
    const rows = Object.freeze(
      Array.from({ length: 9 }, (_, index) =>
        Object.freeze(previewRow(`CUSTOM${index}`)),
      ),
    );
    const before = JSON.stringify(rows);

    renderTable(rows);

    expect(
      screen.getAllByRole("button").map((row) => row.getAttribute("aria-label")),
    ).toEqual(
      rows.map(({ symbol }) => `Open ${symbol} market detail`),
    );
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("calls back with the stable supplied symbol on click", () => {
    const { onOpenSymbolDetail } = renderTable([
      previewRow("ETHUSDT", { key: "demo:ETHUSDT", source: "demo" }),
    ]);

    fireEvent.click(tableRow("ETHUSDT"));

    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("ETHUSDT");
  });

  it("activates on Enter and prevents the native default", () => {
    const { onOpenSymbolDetail } = renderTable([previewRow("BTCUSDT")]);
    const row = tableRow("BTCUSDT");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });

    row.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("BTCUSDT");
  });

  it("activates on Space and prevents the native default", () => {
    const { onOpenSymbolDetail } = renderTable([previewRow("SOLUSDT")]);
    const row = tableRow("SOLUSDT");
    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });

    row.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("SOLUSDT");
  });

  it("does not activate on unrelated keys", () => {
    const { onOpenSymbolDetail } = renderTable([previewRow("XRPUSDT")]);

    fireEvent.keyDown(tableRow("XRPUSDT"), { key: "ArrowDown" });

    expect(onOpenSymbolDetail).not.toHaveBeenCalled();
  });

  it("uses the exact accessible row label and focusable button-row semantics", () => {
    renderTable([previewRow("BNBUSDT")]);

    const row = tableRow("BNBUSDT");

    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute(
      "aria-label",
      "Open BNBUSDT market detail",
    );
  });

  it("uses accepted row.key rather than symbol or array index identity", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      renderTable([
        previewRow("BTCUSDT", {
          key: "demo:BTCUSDT",
          source: "demo",
          lastTradePrice: "10.00",
        }),
        previewRow("BTCUSDT", {
          key: "live:BTCUSDT",
          source: "live",
          lastTradePrice: "20.00",
        }),
      ]);

      expect(screen.getAllByRole("button", {
        name: "Open BTCUSDT market detail",
      })).toHaveLength(2);
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }

    expect(componentSource).toMatch(/key=\{row\.key\}/);
    expect(componentSource).not.toMatch(/key=\{(?:index|rowIndex|i)\}/);
    expect(componentSource).not.toMatch(/\.map\(\([^)]*,\s*(?:index|rowIndex|i)\)/);
  });
});

describe("MarketHealthDesktopTable observed presentation", () => {
  it("preserves observed score, status, price, spread, trades, and numeric zero", () => {
    renderTable([
      previewRow("ZEROUSDT", {
        healthScore: 0,
        healthStatus: "degraded",
        lastTradePrice: "0.0000",
        spreadPct: 0,
        tradesPerMinute: 0,
        lastEventAgeMs: 0,
      }),
    ]);

    const cells = rowCells("ZEROUSDT");

    expect(cells).toHaveLength(6);
    expect(cells[0]).toHaveTextContent("ZEROUSDTView");
    expect(cells[1]).toHaveTextContent("0");
    expect(cells[2]).toHaveTextContent("0.0000");
    expect(cells[3]).toHaveTextContent("0.00%");
    expect(cells[4]).toHaveTextContent("0");
    expect(cells[5]).toHaveTextContent("Degraded");
  });

  it("preserves current missing observed metric formatting", () => {
    renderTable([
      previewRow("EMPTYUSDT", {
        healthScore: null,
        healthStatus: null,
        lastTradePrice: null,
        spreadPct: Number.NaN,
        tradesPerMinute: null,
      }),
    ]);

    const cells = rowCells("EMPTYUSDT");

    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
    expect(cells[3]).toHaveTextContent("—");
    expect(cells[4]).toHaveTextContent("—");
    expect(cells[5]).toHaveTextContent("Unknown");
  });

  it.each([
    ["healthy status", 30, "healthy", "text-emerald-300", "bg-emerald-300", "30%"],
    ["score at 80", 80, null, "text-emerald-300", "bg-emerald-300", "80%"],
    ["degraded status", 20, "degraded", "text-amber-300", "bg-amber-300", "20%"],
    ["score at 50", 50, null, "text-amber-300", "bg-amber-300", "50%"],
    ["unhealthy status", 90, "unhealthy", "text-emerald-300", "bg-emerald-300", "90%"],
    ["score below 50", 49, null, "text-rose-300", "bg-rose-300", "49%"],
    ["zero minimum width", 0, null, "text-rose-300", "bg-rose-300", "4%"],
    ["null neutral", null, null, "text-slate-400", "bg-slate-500", "0%"],
  ] as const)(
    "preserves the current score tone and bar-width rule for %s",
    (_name, score, healthStatus, textClass, barClass, width) => {
      renderTable([
        previewRow("TONEUSDT", {
          healthScore: score,
          healthStatus,
        }),
      ]);

      const scoreCell = rowCells("TONEUSDT")[1];
      const scoreText = within(scoreCell).getByText(String(score ?? "—"));
      const bar = scoreCell.querySelector<HTMLElement>("div[style]");

      expect(scoreText).toHaveClass(textClass);
      expect(bar).not.toBeNull();
      expect(bar).toHaveClass(barClass);
      expect(bar).toHaveStyle({ width });
    },
  );

  it("preserves compact-number formatting for trades per minute", () => {
    renderTable([
      previewRow("VOLUMEUSDT", { tradesPerMinute: 12_345 }),
    ]);

    expect(rowCells("VOLUMEUSDT")[4]).toHaveTextContent("12K");
  });
});

describe("MarketHealthDesktopTable non-observed states", () => {
  it.each([
    ["configured", "Configured"],
    ["awaiting", "Awaiting data"],
    ["unavailable", "Unavailable"],
  ] as const)(
    "keeps metrics visually empty and preserves exact %s wording",
    (availability, statusText) => {
      renderTable([
        previewRow(`${availability.toUpperCase()}USDT`, {
          availability,
          observed: false,
          healthScore: null,
          healthStatus: null,
          lastTradePrice: null,
          spreadPct: null,
          tradesPerMinute: null,
          lastEventAgeMs: null,
        }),
      ]);

      const cells = rowCells(`${availability.toUpperCase()}USDT`);

      expect(cells[1]).toBeEmptyDOMElement();
      expect(cells[2]).toBeEmptyDOMElement();
      expect(cells[3]).toBeEmptyDOMElement();
      expect(cells[4]).toBeEmptyDOMElement();
      expect(cells[5]).toHaveTextContent(statusText);
    },
  );

  it("keeps non-observed status badges neutral without fabricating health", () => {
    renderTable([
      previewRow("WAITUSDT", {
        availability: "awaiting",
        observed: false,
        healthScore: null,
        healthStatus: null,
        lastTradePrice: null,
        spreadPct: null,
        tradesPerMinute: null,
        lastEventAgeMs: null,
      }),
    ]);

    const badge = within(rowCells("WAITUSDT")[5]).getByText("Awaiting data");

    expect(badge).toHaveClass(
      "border-white/10",
      "bg-white/5",
      "text-slate-200",
    );
  });
});

describe("MarketHealthDesktopTable ownership and forbidden scope", () => {
  it("accepts only the accepted preview model and owns no ordering, limits, or fallback", () => {
    expect(componentSource).toMatch(
      /import\s+type\s+\{\s*MarketHealthPreviewRow\s*\}\s+from\s+["']\.\/marketHealthPreviewModel["'];/,
    );
    expect(componentSource).not.toMatch(/DashboardSummary|DashboardSymbolSummary/);
    expect(componentSource).not.toMatch(
      /\.(?:sort|toSorted|slice|splice|reverse)\s*\(/,
    );
    expect(componentSource).not.toMatch(
      /hiddenCount|hasMore|MARKET_HEALTH_PREVIEW_LIMIT|DEMO_MARKETS|Demo fallback|Live fallback/i,
    );
    expect(componentSource).not.toMatch(/source\s*===|availability\s*=|observed\s*=/);
  });

  it("adds no section, loading, empty, view-all, modal, mobile, tooltip, or Wave 4 markup", () => {
    renderTable([]);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Market Health")).not.toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no monitored markets/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /view all/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(componentSource).not.toMatch(
      /Tooltip|tooltip|mobile|modal|dialog|loading|skeleton|empty shell|view all/i,
    );
    expect(componentSource).not.toMatch(
      /ingesting|warming|not configured|data unavailable|freshness|source badge/i,
    );
  });

  it("has no query, API, router, popup, time, random, timer, or network dependency", () => {
    expect(componentSource).not.toMatch(
      /from\s+["'][^"']*(?:api|query|router|popup|resource|adapter|selectedSymbol)[^"']*["']/i,
    );
    expect(componentSource).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|new\s+Date|Math\.random|setTimeout|setInterval|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(componentSource).not.toMatch(/\buse(?:Query|Mutation|Navigate|Location|Params)\b/);
  });
});

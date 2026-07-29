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
const presentationSource = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/marketHealthPresentation.ts"),
  "utf8",
);

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
  it("preserves the desktop wrapper, table label, six columns, widths, and typography", () => {
    const { container } = renderTable([previewRow("BTCUSDT")]);
    const root = container.firstElementChild;
    const table = screen.getByRole("table", { name: "Market health" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    const columns = Array.from(table.querySelectorAll("col"));
    const row = tableRow("BTCUSDT");
    const cells = rowCells("BTCUSDT");

    expect(root).toHaveAttribute(
      "class",
      "hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block",
    );
    expect(table).toHaveAttribute("aria-label", "Market health");
    expect(table).toHaveClass(
      "w-full",
      "table-fixed",
      "border-collapse",
      "text-left",
    );
    expect(headers).toEqual([
      "Market",
      "Health Score",
      "Last Price",
      "Spread",
      "Trades/min",
      "Status",
    ]);
    expect(columns.map((column) => column.className)).toEqual([
      "w-[18%]",
      "w-[22%]",
      "w-[11%]",
      "w-[11%]",
      "w-[14%]",
      "w-[24%]",
    ]);
    expect(screen.getAllByRole("row")[0]).toHaveAttribute(
      "class",
      "border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500",
    );
    expect(row).toHaveAttribute(
      "class",
      "cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0",
    );
    expect(within(row).getByText("BTCUSDT")).toHaveAttribute(
      "class",
      "min-w-0 truncate font-mono text-sm font-bold text-slate-50",
    );
    expect(within(row).getByText("View")).toHaveAttribute(
      "class",
      "hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:inline",
    );
    expect(cells.map((cell) => cell.className)).toEqual([
      "min-w-0 px-2 py-3 pr-2",
      "px-2 py-3 pr-4",
      "whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-100 2xl:text-sm",
      "whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm",
      "whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm",
      "px-2 py-3 text-right",
    ]);
  });
});

describe("MarketHealthDesktopTable order, identity, and activation", () => {
  it("renders every supplied row in supplied order without mutation or limiting", () => {
    const rows = Object.freeze(
      Array.from({ length: 9 }, (_, index) =>
        Object.freeze(previewRow(`ROW${8 - index}`)),
      ),
    );
    const before = JSON.stringify(rows);

    renderTable(rows);

    expect(
      screen.getAllByRole("button").map((row) => row.getAttribute("aria-label")),
    ).toEqual(rows.map(({ symbol }) => `Open ${symbol} market detail`));
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it("uses row.key identity when duplicate symbols reorder", () => {
    const demo = previewRow("SAME", {
      key: "demo:SAME",
      source: "demo",
      lastTradePrice: "10.00",
    });
    const live = previewRow("SAME", {
      key: "live:SAME",
      source: "live",
      lastTradePrice: "20.00",
    });
    const { rerender } = renderTable([demo, live]);
    const firstRows = screen.getAllByRole("button", {
      name: "Open SAME market detail",
    });

    rerender(
      <MarketHealthDesktopTable
        rows={[live, demo]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const reorderedRows = screen.getAllByRole("button", {
      name: "Open SAME market detail",
    });
    expect(reorderedRows[0]).toBe(firstRows[1]);
    expect(reorderedRows[1]).toBe(firstRows[0]);
    expect(componentSource).toMatch(/key=\{row\.key\}/);
  });

  it("calls back with the exact symbol on click", () => {
    const { onOpenSymbolDetail } = renderTable([previewRow("ETHUSDT")]);

    fireEvent.click(tableRow("ETHUSDT"));

    expect(onOpenSymbolDetail).toHaveBeenCalledOnce();
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("ETHUSDT");
  });

  it.each(["Enter", " "])(
    "activates on %j, prevents default, and passes the exact symbol",
    (key) => {
      const { onOpenSymbolDetail } = renderTable([previewRow("SOLUSDT")]);
      const row = tableRow("SOLUSDT");
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });

      row.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(onOpenSymbolDetail).toHaveBeenCalledOnce();
      expect(onOpenSymbolDetail).toHaveBeenCalledWith("SOLUSDT");
    },
  );

  it("ignores unrelated keys and preserves exact accessible row semantics", () => {
    const { onOpenSymbolDetail } = renderTable([previewRow("BNBUSDT")]);
    const row = tableRow("BNBUSDT");

    fireEvent.keyDown(row, { key: "ArrowDown" });

    expect(onOpenSymbolDetail).not.toHaveBeenCalled();
    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute(
      "aria-label",
      "Open BNBUSDT market detail",
    );
  });
});

describe("MarketHealthDesktopTable observed presentation", () => {
  it("preserves numeric zero, exact metric formatting, and compact numbers", () => {
    renderTable([
      previewRow("ZEROUSDT", {
        healthScore: 0,
        healthStatus: "degraded",
        lastTradePrice: "0.0000",
        spreadPct: 0,
        tradesPerMinute: 0,
        lastEventAgeMs: 0,
      }),
      previewRow("VOLUMEUSDT", { tradesPerMinute: 12_345 }),
    ]);

    const zeroCells = rowCells("ZEROUSDT");
    expect(zeroCells).toHaveLength(6);
    expect(zeroCells[0]).toHaveTextContent("ZEROUSDTView");
    expect(zeroCells[1]).toHaveTextContent("0");
    expect(zeroCells[2]).toHaveTextContent("0.0000");
    expect(zeroCells[3]).toHaveTextContent("0.00%");
    expect(zeroCells[4]).toHaveTextContent("0");
    expect(zeroCells[5]).toHaveTextContent("Degraded");
    expect(rowCells("VOLUMEUSDT")[4]).toHaveTextContent("12K");
  });

  it("preserves missing observed metrics and neutral Unknown status", () => {
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
    for (const index of [1, 2, 3, 4]) {
      expect(cells[index]).toHaveTextContent("—");
    }
    expect(cells[5]).toHaveTextContent("Unknown");
    expect(within(cells[5]).getByText("Unknown")).toHaveClass(
      "border-white/10",
      "bg-white/5",
      "text-slate-200",
    );
  });

  it.each([
    ["healthy + low", 2, "healthy", "text-emerald-300", "bg-emerald-300", "4%"],
    ["degraded + 95", 95, "degraded", "text-emerald-300", "bg-emerald-300", "95%"],
    ["unhealthy + 90", 90, "unhealthy", "text-emerald-300", "bg-emerald-300", "90%"],
    ["null + 80", 80, null, "text-emerald-300", "bg-emerald-300", "80%"],
    ["null + 50", 50, null, "text-amber-300", "bg-amber-300", "50%"],
    ["null + 49", 49, null, "text-rose-300", "bg-rose-300", "49%"],
    ["null + 0", 0, null, "text-rose-300", "bg-rose-300", "4%"],
    ["null + null", null, null, "text-slate-400", "bg-slate-500", "0%"],
  ] as const)(
    "preserves binding score-first tone precedence for %s",
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

  it("keeps degraded status wording while degraded + 95 uses emerald score tone", () => {
    renderTable([
      previewRow("CORRECTED", {
        healthStatus: "degraded",
        healthScore: 95,
      }),
    ]);

    const cells = rowCells("CORRECTED");
    expect(within(cells[5]).getByText("Degraded")).toHaveClass(
      "border-amber-400/30",
      "bg-amber-400/10",
      "text-amber-100",
    );
    expect(within(cells[1]).getByText("95")).toHaveClass("text-emerald-300");
  });

  it.each([
    [
      "healthy",
      "Healthy",
      ["border-emerald-400/30", "bg-emerald-400/10", "text-emerald-100"],
    ],
    [
      "degraded",
      "Degraded",
      ["border-amber-400/30", "bg-amber-400/10", "text-amber-100"],
    ],
    [
      "unhealthy",
      "Unhealthy",
      ["border-orange-400/30", "bg-orange-400/10", "text-orange-100"],
    ],
    [null, "Unknown", ["border-white/10", "bg-white/5", "text-slate-200"]],
  ] as const)(
    "preserves observed %s status wording and StatusBadge classes",
    (healthStatus, statusText, classes) => {
      renderTable([previewRow("STATUSUSDT", { healthStatus })]);

      expect(within(rowCells("STATUSUSDT")[5]).getByText(statusText)).toHaveClass(
        ...classes,
      );
    },
  );
});

describe("MarketHealthDesktopTable non-observed states", () => {
  it.each([
    ["configured", "Configured"],
    ["awaiting", "Awaiting data"],
    ["unavailable", "Unavailable"],
  ] as const)(
    "keeps metrics empty and preserves exact %s wording",
    (availability, statusText) => {
      const symbol = `${availability.toUpperCase()}USDT`;
      renderTable([
        previewRow(symbol, {
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

      const cells = rowCells(symbol);
      for (const index of [1, 2, 3, 4]) {
        expect(cells[index]).toBeEmptyDOMElement();
      }
      expect(within(cells[5]).getByText(statusText)).toHaveClass(
        "border-white/10",
        "bg-white/5",
        "text-slate-200",
      );
    },
  );
});

describe("MarketHealthDesktopTable status badge layout regression", () => {
  it("allocates enough width for every supported status without clipping or abbreviation", () => {
    const rows = [
      previewRow("HEALTHYUSDT", { healthStatus: "healthy" }),
      previewRow("DEGRADEDUSDT", { healthStatus: "degraded" }),
      previewRow("UNHEALTHYUSDT", { healthStatus: "unhealthy" }),
      previewRow("CONFIGUREDUSDT", {
        availability: "configured",
        observed: false,
      }),
      previewRow("AWAITINGUSDT", {
        availability: "awaiting",
        observed: false,
      }),
      previewRow("UNAVAILABLEUSDT", {
        availability: "unavailable",
        observed: false,
      }),
      previewRow("UNKNOWNUSDT", {
        healthStatus: null,
      }),
    ];
    const labels = [
      "Healthy",
      "Degraded",
      "Unhealthy",
      "Configured",
      "Awaiting data",
      "Unavailable",
      "Unknown",
    ];

    renderTable(rows);

    expect(componentSource).toMatch(
      /<col className="w-\[11%\]" \/>[\s\S]*<col className="w-\[24%\]" \/>/,
    );
    expect(componentSource).toMatch(
      /<div className="flex min-w-0 justify-end">/,
    );
    expect(componentSource).not.toContain(
      "flex min-w-0 justify-end overflow-hidden",
    );

    for (const [index, label] of labels.entries()) {
      const badge = within(rowCells(rows[index].symbol)[5]).getByText(label);

      expect(badge).toHaveTextContent(label);
      expect(badge.textContent).toBe(label);
      expect(badge).not.toHaveClass("truncate");
    }
  });
});

describe("MarketHealthDesktopTable ownership and regressions", () => {
  it("uses the readonly preview model and a rows-specific collection guard", () => {
    const rowTransformation =
      /\brows\s*\.\s*(?:sort|toSorted|slice|splice|reverse)\s*\(/;

    expect(componentSource).toMatch(
      /import\s+type\s+\{\s*MarketHealthPreviewRow\s*\}\s+from\s+["']\.\/marketHealthPreviewModel["'];/,
    );
    expect(componentSource).toMatch(
      /from\s+["']\.\/marketHealthPresentation["'];/,
    );
    expect(componentSource).toMatch(
      /rows:\s*readonly\s+MarketHealthPreviewRow\[\]/,
    );
    expect(componentSource).not.toMatch(rowTransformation);
    expect(rowTransformation.test("rows.slice(0, 7)")).toBe(true);
    expect(rowTransformation.test("rows.toSorted(compareRows)")).toBe(true);
    expect(rowTransformation.test("value.slice(1)")).toBe(false);
    expect(presentationSource).toContain("value.slice(1)");
    expect(componentSource).not.toMatch(
      /\brows\s*\.\s*(?:push|pop|shift|unshift|copyWithin|fill)\s*\(/,
    );
    expect(componentSource).not.toMatch(
      /hiddenCount|hasMore|MARKET_HEALTH_PREVIEW_LIMIT|DEMO_MARKETS|Demo fallback|Live fallback/i,
    );
    expect(componentSource).not.toMatch(
      /source\s*===|availability\s*=|observed\s*=/,
    );
  });

  it("executes the exact forbidden-import regex against both quote styles", () => {
    const forbiddenImport =
      /from\s+["'][^"']*(?:api|query|router|popup|resource|adapter|selectedSymbol)[^"']*["']/i;

    expect(componentSource).not.toMatch(forbiddenImport);
    expect(forbiddenImport.test('import { value } from "./api";')).toBe(true);
    expect(forbiddenImport.test("import { value } from './router';")).toBe(true);
    expect(
      forbiddenImport.test(
        'import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";',
      ),
    ).toBe(false);
    expect(forbiddenImport.source).not.toContain("[^#']*");
  });

  it("owns no query, network, routing, popup, storage, time, random, or modal state", () => {
    expect(componentSource).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|new\s+Date|Math\.random|setTimeout|setInterval|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(componentSource).not.toMatch(
      /\buse(?:Query|Mutation|Navigate|Location|Params)\b/,
    );
    expect(componentSource).not.toMatch(
      /Tooltip|tooltip|mobile|modal|dialog|loading|skeleton|empty shell|view all|icon/i,
    );
  });
});

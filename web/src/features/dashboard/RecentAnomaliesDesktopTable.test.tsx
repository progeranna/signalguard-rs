import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  mapDashboardAnomalyToRecentPreviewRow,
  type RecentAnomaliesPreviewRow,
} from "./recentAnomaliesPreviewModel";
import { RecentAnomaliesDesktopTable } from "./RecentAnomaliesDesktopTable";
import type { DashboardAnomaly } from "./types";

const sourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/RecentAnomaliesDesktopTable.tsx",
);
const source = readFileSync(sourcePath, "utf8");

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
    specifier.includes("symbolPopupResource") ||
    specifier.includes("symbolMarketResource") ||
    specifier.includes("selectedSymbol") ||
    specifier.includes("shared/api/client") ||
    specifier.includes("RecentAnomaliesMobileCards")
  );
}

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
  "00000000-0000-4000-8000-000000000006",
  "00000000-0000-4000-8000-000000000007",
  "00000000-0000-4000-8000-000000000008",
] as const;

function anomaly(
  overrides: Partial<DashboardAnomaly> = {},
): DashboardAnomaly {
  return {
    id: ids[0],
    symbol: "BTCUSDT",
    anomaly_type: "spread_spike",
    severity: "warning",
    message: "Preview context must remain hidden",
    observed_value: 1.23456,
    threshold_value: 0.5,
    event_time: "2026-07-28T10:11:12.000Z",
    created_at: "2026-07-28T09:08:07.000Z",
    ...overrides,
  };
}

function row(
  overrides: Partial<DashboardAnomaly> = {},
): RecentAnomaliesPreviewRow {
  return mapDashboardAnomalyToRecentPreviewRow(anomaly(overrides));
}

function expectedTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function cellsFor(name: string): HTMLElement[] {
  const tableRow = screen.getByRole("button", { name });

  return Array.from(tableRow.querySelectorAll("td"));
}

describe("RecentAnomaliesDesktopTable presentation", () => {
  it("preserves the desktop wrapper, table label, columns, widths, and header classes", () => {
    const { container } = render(
      <RecentAnomaliesDesktopTable
        rows={[row()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block",
    );

    const table = screen.getByRole("table", { name: "Recent anomalies" });
    expect(table).toHaveAttribute(
      "class",
      "w-full table-fixed border-collapse text-left",
    );
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Time", "Market", "Type", "Severity", "Observed", "Threshold"]);
    expect(
      Array.from(table.querySelectorAll("col")).map((column) =>
        column.getAttribute("class"),
      ),
    ).toEqual([
      "w-[15%]",
      "w-[16%]",
      "w-[20%]",
      "w-[19%]",
      "w-[15%]",
      "w-[15%]",
    ]);
    expect(table.querySelector("thead tr")).toHaveAttribute(
      "class",
      "border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500",
    );
  });

  it("preserves supplied order and calls back with the exact row symbol", () => {
    const onOpenSymbolDetail = vi.fn();
    const rows = [
      row({ id: ids[0], symbol: "SOLUSDT" }),
      row({ id: ids[1], symbol: "BTCUSDT" }),
      row({ id: ids[2], symbol: "ETHUSDT" }),
    ];

    render(
      <RecentAnomaliesDesktopTable
        rows={rows}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );

    expect(
      screen
        .getAllByRole("button")
        .map((tableRow) => tableRow.getAttribute("aria-label")),
    ).toEqual([
      "Open SOLUSDT market detail",
      "Open BTCUSDT market detail",
      "Open ETHUSDT market detail",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    );
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("BTCUSDT");
  });

  it("uses accepted UUID identity rather than array position", () => {
    const btc = row({ id: ids[0], symbol: "BTCUSDT" });
    const eth = row({ id: ids[1], symbol: "ETHUSDT" });
    const { rerender } = render(
      <RecentAnomaliesDesktopTable
        rows={[btc, eth]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );
    const originalBtcRow = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });

    rerender(
      <RecentAnomaliesDesktopTable
        rows={[eth, btc]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    ).toBe(originalBtcRow);
    expect(source).not.toMatch(
      /key=\{(?:index|row\.(?:symbol|message|eventTime|createdAt))\}/,
    );
  });

  it("preserves row focusability, role, classes, exact accessible labels, and click behavior", () => {
    const onOpenSymbolDetail = vi.fn();
    render(
      <RecentAnomaliesDesktopTable
        rows={[row()]}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );

    const tableRow = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    expect(tableRow.tagName).toBe("TR");
    expect(tableRow).toHaveAttribute("tabindex", "0");
    expect(tableRow).toHaveAttribute(
      "class",
      "cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0",
    );

    fireEvent.click(tableRow);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("BTCUSDT");
  });

  it("activates on Enter and Space, prevents defaults, and ignores other keys", () => {
    const onOpenSymbolDetail = vi.fn();
    render(
      <RecentAnomaliesDesktopTable
        rows={[row()]}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );
    const tableRow = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });

    expect(fireEvent.keyDown(tableRow, { key: "Enter" })).toBe(false);
    expect(fireEvent.keyDown(tableRow, { key: " " })).toBe(false);
    expect(fireEvent.keyDown(tableRow, { key: "ArrowDown" })).toBe(true);
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(2);
    expect(onOpenSymbolDetail).toHaveBeenNthCalledWith(1, "BTCUSDT");
    expect(onOpenSymbolDetail).toHaveBeenNthCalledWith(2, "BTCUSDT");
  });

  it("uses event time when truthy and created-at as the fallback", () => {
    const eventTime = "2026-07-28T10:11:12.000Z";
    const createdAt = "2026-07-28T03:04:05.000Z";
    const eventRow = row({ id: ids[0], symbol: "BTCUSDT", event_time: eventTime });
    const fallbackRow = {
      ...row({ id: ids[1], symbol: "ETHUSDT", created_at: createdAt }),
      eventTime: "",
    };

    render(
      <RecentAnomaliesDesktopTable
        rows={[eventRow, fallbackRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(cellsFor("Open BTCUSDT market detail")[0]).toHaveTextContent(
      expectedTime(eventTime),
    );
    expect(cellsFor("Open ETHUSDT market detail")[0]).toHaveTextContent(
      expectedTime(createdAt),
    );
  });

  it("preserves invalid timestamps and renders unavailable for falsy timestamps", () => {
    const invalidRow = {
      ...row({ id: ids[0], symbol: "BTCUSDT" }),
      eventTime: "not-a-timestamp",
    };
    const emptyRow = {
      ...row({ id: ids[1], symbol: "ETHUSDT" }),
      eventTime: "",
      createdAt: "",
    };
    const undefinedRow = {
      ...row({ id: ids[2], symbol: "SOLUSDT" }),
      eventTime: undefined,
      createdAt: undefined,
    } as unknown as RecentAnomaliesPreviewRow;

    render(
      <RecentAnomaliesDesktopTable
        rows={[invalidRow, emptyRow, undefinedRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(cellsFor("Open BTCUSDT market detail")[0]).toHaveTextContent(
      "not-a-timestamp",
    );
    expect(cellsFor("Open ETHUSDT market detail")[0]).toHaveTextContent(
      "Unavailable",
    );
    expect(cellsFor("Open SOLUSDT market detail")[0]).toHaveTextContent(
      "Unavailable",
    );
  });

  it("renders known and unknown accepted detector labels directly", () => {
    const knownRow = row({ id: ids[0], symbol: "BTCUSDT", anomaly_type: "spread_spike" });
    const unknownRow = row({
      id: ids[1],
      symbol: "ETHUSDT",
      anomaly_type: "custom_detector",
    });
    const acceptedUnknownRow = {
      ...row({
        id: ids[2],
        symbol: "SOLUSDT",
        anomaly_type: "another_detector",
      }),
      detectorLabel: "Accepted Unknown Label",
    };

    render(
      <RecentAnomaliesDesktopTable
        rows={[knownRow, unknownRow, acceptedUnknownRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(cellsFor("Open BTCUSDT market detail")[2]).toHaveTextContent(
      "Spread Spike",
    );
    expect(cellsFor("Open ETHUSDT market detail")[2]).toHaveTextContent(
      "Custom Detector",
    );
    expect(cellsFor("Open SOLUSDT market detail")[2]).toHaveTextContent(
      "Accepted Unknown Label",
    );
    expect(screen.queryByText("Another Detector")).not.toBeInTheDocument();
  });

  it.each([
    {
      severity: "info" as const,
      label: "Info",
      badgeTone: "border-sky-400/35 bg-sky-400/10 text-sky-200",
      observedTone: "text-sky-200",
    },
    {
      severity: "warning" as const,
      label: "Warning",
      badgeTone: "border-amber-400/35 bg-amber-400/10 text-amber-200",
      observedTone: "text-amber-300",
    },
    {
      severity: "critical" as const,
      label: "Critical",
      badgeTone: "border-rose-400/35 bg-rose-400/10 text-rose-200",
      observedTone: "text-rose-300",
    },
  ])(
    "uses accepted $severity descriptor label, compact badge classes, and observed tone",
    ({ severity, label, badgeTone, observedTone }) => {
      render(
        <RecentAnomaliesDesktopTable
          rows={[row({ severity })]}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      const cells = cellsFor("Open BTCUSDT market detail");
      expect(within(cells[3]).getByText(label)).toHaveAttribute(
        "class",
        `inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2 py-1 text-[10px] tracking-[0.08em] 2xl:px-2.5 2xl:text-xs 2xl:tracking-[0.12em] ${badgeTone}`,
      );
      expect(cells[4]).toHaveAttribute(
        "class",
        `whitespace-nowrap px-2 py-3 pr-2 text-xs font-bold 2xl:text-sm ${observedTone}`,
      );
    },
  );

  it.each([
    ["price_move", 1.23456, -0.5, "1.235%", "-0.500%"],
    ["spread_spike", 0, -2, "0.000%", "-2.000%"],
    ["event_lag_spike", 999, 1_500, "999 ms", "1.5 s"],
    ["stale_data", 1_000, 0, "1.0 s", "0 ms"],
    ["quote_stuck", -250, 2_250, "-250 ms", "2.3 s"],
    ["trade_burst", 1_234.6, -1.2, "1,235 /m", "-1 /m"],
    ["depth_sequence_gap", 12.6, -3.4, "13 gap", "-3 limit"],
    ["custom_detector", 1_234.5678, -12.3456, "1,234.568", "-12.346"],
  ] as const)(
    "formats %s observed and threshold values",
    (anomalyType, observedValue, thresholdValue, observed, threshold) => {
      render(
        <RecentAnomaliesDesktopTable
          rows={[
            row({
              anomaly_type: anomalyType,
              observed_value: observedValue,
              threshold_value: thresholdValue,
            }),
          ]}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      const cells = cellsFor("Open BTCUSDT market detail");
      expect(cells[4]).toHaveTextContent(observed);
      expect(cells[5]).toHaveTextContent(threshold);
    },
  );

  it("renders null, undefined, and NaN numeric values as em dashes", () => {
    const nullRow = row({
      id: ids[0],
      symbol: "BTCUSDT",
      observed_value: null,
      threshold_value: null,
    });
    const nanRow = {
      ...row({ id: ids[1], symbol: "ETHUSDT" }),
      observedValue: Number.NaN,
      thresholdValue: Number.NaN,
    };
    const undefinedRow = {
      ...row({ id: ids[2], symbol: "SOLUSDT" }),
      observedValue: undefined,
      thresholdValue: undefined,
    } as unknown as RecentAnomaliesPreviewRow;

    render(
      <RecentAnomaliesDesktopTable
        rows={[nullRow, nanRow, undefinedRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    for (const name of [
      "Open BTCUSDT market detail",
      "Open ETHUSDT market detail",
      "Open SOLUSDT market detail",
    ]) {
      const cells = cellsFor(name);
      expect(cells[4]).toHaveTextContent("—");
      expect(cells[5]).toHaveTextContent("—");
    }
  });

  it("does not order, limit, reject duplicate IDs, or mutate supplied rows", () => {
    const frozenRows = Object.freeze(
      ids.map((id, index) =>
        Object.freeze(
          row({
            id,
            symbol: `ASSET${8 - index}USDT`,
            event_time: `2026-07-28T10:00:0${index}.000Z`,
          }),
        ),
      ),
    );
    const before = JSON.stringify(frozenRows);
    const duplicateRows = [
      frozenRows[0],
      { ...frozenRows[1], id: frozenRows[0].id },
    ] as const;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { unmount } = render(
        <RecentAnomaliesDesktopTable
          rows={frozenRows}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      expect(screen.getAllByRole("button")).toHaveLength(8);
      expect(
        screen
          .getAllByRole("button")
          .map((tableRow) => tableRow.getAttribute("aria-label")),
      ).toEqual(
        frozenRows.map((entry) => `Open ${entry.symbol} market detail`),
      );
      expect(JSON.stringify(frozenRows)).toBe(before);
      unmount();

      expect(() =>
        render(
          <RecentAnomaliesDesktopTable
            rows={duplicateRows}
            onOpenSymbolDetail={vi.fn()}
          />,
        ),
      ).not.toThrow();
      expect(screen.getAllByRole("button")).toHaveLength(2);
    } finally {
      consoleError.mockRestore();
    }

    expect(source).toMatch(/rows\.map\(\(row\)/);
    expect(source).not.toMatch(
      /\brows\s*\.\s*(?:sort|toSorted|slice|splice|reverse|filter|shift|unshift|push|pop)\s*\(/,
    );
    expect(source).not.toMatch(/(?:new\s+)?(?:Set|Map)\s*\(\s*rows/);
  });

  it("renders only leased desktop semantics and ignores hidden preview context", () => {
    const baseRow = row({
      message: "HIDDEN_MESSAGE_SENTINEL",
      anomaly_type: "spread_spike",
    });
    const hiddenRow = {
      ...baseRow,
      activeLabel: "HIDDEN_ACTIVE_LABEL_SENTINEL",
      effectiveTimestampMs: 987_654_321,
      severityDescriptor: {
        ...baseRow.severityDescriptor,
        description: "HIDDEN_DESCRIPTION_SENTINEL",
      },
    } satisfies RecentAnomaliesPreviewRow;
    const { container } = render(
      <RecentAnomaliesDesktopTable
        rows={[hiddenRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(container.querySelector("section")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector("[title]")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Anomalies")).not.toBeInTheDocument();
    expect(screen.queryByText("View all")).not.toBeInTheDocument();
    expect(screen.queryByText("HIDDEN_MESSAGE_SENTINEL")).not.toBeInTheDocument();
    expect(screen.queryByText("HIDDEN_ACTIVE_LABEL_SENTINEL")).not.toBeInTheDocument();
    expect(screen.queryByText("HIDDEN_DESCRIPTION_SENTINEL")).not.toBeInTheDocument();
    expect(screen.queryByText("987654321")).not.toBeInTheDocument();

    const importSources = staticImportSpecifiers(source);
    expect(importSources.filter(isForbiddenOwnershipImport)).toEqual([]);
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now\s*\(|new\s+Date\s*\(\s*\)|Math\.random|setTimeout|setInterval|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toMatch(
      /\brow\.(?:message|activeLabel|effectiveTimestampMs)\b|\brow\.severityDescriptor\.description\b/,
    );
    expect(source).not.toContain("lg:hidden");
    expect(source).not.toContain("grid-cols-2");
  });
});

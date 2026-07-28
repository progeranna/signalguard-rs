import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardAnomaly } from "./types";
import {
  mapDashboardAnomalyToRecentPreviewRow,
  type RecentAnomaliesPreviewRow,
} from "./recentAnomaliesPreviewModel";
import {
  RecentAnomaliesDesktopTable,
  type RecentAnomaliesDesktopTableProps,
} from "./RecentAnomaliesDesktopTable";

const source = readFileSync(
  path.join(
    process.cwd(),
    "src/features/dashboard/RecentAnomaliesDesktopTable.tsx",
  ),
  "utf8",
);

const BASE_ANOMALY: DashboardAnomaly = {
  id: "00000000-0000-4000-8000-000000000001",
  symbol: "BTCUSDT",
  anomaly_type: "spread_spike",
  severity: "warning",
  message: "Spread exceeded the configured threshold.",
  observed_value: 1.25,
  threshold_value: 0.5,
  event_time: "2026-07-20T10:00:00.000Z",
  created_at: "2026-07-20T10:00:01.000Z",
};

function previewRow(
  idSuffix: number,
  overrides: Partial<DashboardAnomaly> = {},
): RecentAnomaliesPreviewRow {
  return mapDashboardAnomalyToRecentPreviewRow({
    ...BASE_ANOMALY,
    id: `00000000-0000-4000-8000-${String(idSuffix).padStart(12, "0")}`,
    ...overrides,
  });
}

function renderTable(
  rows: readonly RecentAnomaliesPreviewRow[],
  onOpenSymbolDetail: RecentAnomaliesDesktopTableProps["onOpenSymbolDetail"] =
    vi.fn(),
) {
  return render(
    <RecentAnomaliesDesktopTable
      rows={rows}
      onOpenSymbolDetail={onOpenSymbolDetail}
    />,
  );
}

function expectedTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

describe("RecentAnomaliesDesktopTable presentation", () => {
  it("preserves the exact desktop wrapper, table label, columns, and widths", () => {
    renderTable([previewRow(1)]);

    const table = screen.getByRole("table", { name: "Recent anomalies" });
    const wrapper = table.parentElement;

    expect(wrapper).toHaveClass(
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
    expect(table).toHaveClass(
      "w-full",
      "table-fixed",
      "border-collapse",
      "text-left",
    );
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toEqual([
      "Time",
      "Market",
      "Type",
      "Severity",
      "Observed",
      "Threshold",
    ]);
    expect(
      Array.from(table.querySelectorAll("col"), (column) => column.className),
    ).toEqual([
      "w-[15%]",
      "w-[16%]",
      "w-[20%]",
      "w-[19%]",
      "w-[15%]",
      "w-[15%]",
    ]);
  });

  it("preserves supplied row order without local sorting", () => {
    const rows = [
      previewRow(1, {
        symbol: "BTCUSDT",
        event_time: "2026-07-20T10:00:00.000Z",
      }),
      previewRow(2, {
        symbol: "SOLUSDT",
        event_time: "2026-07-20T12:00:00.000Z",
      }),
      previewRow(3, {
        symbol: "ETHUSDT",
        event_time: "2026-07-20T11:00:00.000Z",
      }),
    ];

    renderTable(rows);

    expect(
      screen
        .getAllByRole("button")
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual([
      "Open BTCUSDT market detail",
      "Open SOLUSDT market detail",
      "Open ETHUSDT market detail",
    ]);
  });

  it("uses accepted UUID identity rather than position, symbol, time, or message", () => {
    const first = previewRow(1, { symbol: "BTCUSDT" });
    const second = previewRow(2, { symbol: "ETHUSDT" });
    const onOpenSymbolDetail = vi.fn();
    const { rerender } = renderTable([first, second], onOpenSymbolDetail);
    const firstNode = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    const secondNode = screen.getByRole("button", {
      name: "Open ETHUSDT market detail",
    });

    rerender(
      <RecentAnomaliesDesktopTable
        rows={[second, first]}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    ).toBe(firstNode);
    expect(
      screen.getByRole("button", { name: "Open ETHUSDT market detail" }),
    ).toBe(secondNode);
    expect(source).toContain("key={row.id}");
    expect(source).not.toMatch(/key=\{(?:index|rowIndex)\}/);
    expect(source).not.toContain("key={row.symbol}");
    expect(source).not.toContain("key={row.message}");
    expect(source).not.toContain("key={row.eventTime}");
    expect(source).not.toContain("key={row.createdAt}");
  });

  it("opens the supplied symbol on click", () => {
    const onOpenSymbolDetail = vi.fn();
    renderTable([previewRow(1, { symbol: "ETHUSDT" })], onOpenSymbolDetail);

    fireEvent.click(
      screen.getByRole("button", { name: "Open ETHUSDT market detail" }),
    );

    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("ETHUSDT");
  });

  it("activates on Enter and prevents the default keyboard action", () => {
    const onOpenSymbolDetail = vi.fn();
    renderTable([previewRow(1)], onOpenSymbolDetail);
    const row = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    const event = createEvent.keyDown(row, { key: "Enter", cancelable: true });

    fireEvent(row, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("BTCUSDT");
  });

  it("activates on Space and prevents the default keyboard action", () => {
    const onOpenSymbolDetail = vi.fn();
    renderTable([previewRow(1)], onOpenSymbolDetail);
    const row = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    const event = createEvent.keyDown(row, {
      key: " ",
      code: "Space",
      cancelable: true,
    });

    fireEvent(row, event);

    expect(event.defaultPrevented).toBe(true);
    expect(onOpenSymbolDetail).toHaveBeenCalledTimes(1);
    expect(onOpenSymbolDetail).toHaveBeenCalledWith("BTCUSDT");
  });

  it("keeps rows focusable with the exact accessible market-detail label", () => {
    renderTable([previewRow(1, { symbol: "SOLUSDT" })]);

    const row = screen.getByRole("button", {
      name: "Open SOLUSDT market detail",
    });

    expect(row).toHaveAttribute("role", "button");
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute(
      "aria-label",
      "Open SOLUSDT market detail",
    );
  });

  it("uses truthy event time, falls back to created time, and preserves invalid time text", () => {
    const eventTime = "2026-07-20T10:00:00.000Z";
    const eventCreatedAt = "2026-07-20T15:00:00.000Z";
    const fallbackCreatedAt = "2026-07-20T11:00:00.000Z";
    renderTable([
      previewRow(1, {
        symbol: "BTCUSDT",
        event_time: eventTime,
        created_at: eventCreatedAt,
      }),
      previewRow(2, {
        symbol: "ETHUSDT",
        event_time: "",
        created_at: fallbackCreatedAt,
      }),
      previewRow(3, {
        symbol: "SOLUSDT",
        event_time: "invalid-event-time",
        created_at: "2026-07-20T12:00:00.000Z",
      }),
    ]);

    const btcCells = within(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    ).getAllByRole("cell");
    const ethCells = within(
      screen.getByRole("button", { name: "Open ETHUSDT market detail" }),
    ).getAllByRole("cell");
    const solCells = within(
      screen.getByRole("button", { name: "Open SOLUSDT market detail" }),
    ).getAllByRole("cell");

    expect(btcCells[0]).toHaveTextContent(expectedTime(eventTime));
    expect(btcCells[0]).not.toHaveTextContent(expectedTime(eventCreatedAt));
    expect(ethCells[0]).toHaveTextContent(expectedTime(fallbackCreatedAt));
    expect(solCells[0]).toHaveTextContent("invalid-event-time");
  });

  it("renders known and unknown detector labels supplied by the accepted model", () => {
    const known = previewRow(1, { anomaly_type: "depth_sequence_gap" });
    const unknown = previewRow(2, {
      symbol: "ETHUSDT",
      anomaly_type: "custom_liquidity_gap",
    });

    expect(known.detectorLabel).toBe("Depth Sequence Gap");
    expect(unknown.detectorLabel).toBe("Custom Liquidity Gap");

    renderTable([known, unknown]);

    expect(screen.getByText("Depth Sequence Gap")).toBeInTheDocument();
    expect(screen.getByText("Custom Liquidity Gap")).toBeInTheDocument();
  });

  it("preserves all severity labels, badge tones, and observed-value colors", () => {
    renderTable([
      previewRow(1, {
        symbol: "BTCUSDT",
        severity: "critical",
        observed_value: 11,
      }),
      previewRow(2, {
        symbol: "ETHUSDT",
        severity: "warning",
        observed_value: 22,
      }),
      previewRow(3, {
        symbol: "SOLUSDT",
        severity: "info",
        observed_value: 33,
      }),
    ]);

    const criticalRow = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    const warningRow = screen.getByRole("button", {
      name: "Open ETHUSDT market detail",
    });
    const infoRow = screen.getByRole("button", {
      name: "Open SOLUSDT market detail",
    });

    expect(within(criticalRow).getByText("Critical")).toHaveClass(
      "border-rose-400/35",
      "bg-rose-400/10",
      "text-rose-200",
    );
    expect(within(warningRow).getByText("Warning")).toHaveClass(
      "border-amber-400/35",
      "bg-amber-400/10",
      "text-amber-200",
    );
    expect(within(infoRow).getByText("Info")).toHaveClass(
      "border-sky-400/35",
      "bg-sky-400/10",
      "text-sky-200",
    );
    expect(within(criticalRow).getAllByRole("cell")[4]).toHaveClass(
      "text-rose-300",
    );
    expect(within(warningRow).getAllByRole("cell")[4]).toHaveClass(
      "text-amber-300",
    );
    expect(within(infoRow).getAllByRole("cell")[4]).toHaveClass(
      "text-sky-200",
    );
  });
});

type FormattingCase = Readonly<{
  name: string;
  anomalyType: string;
  observed: number | null;
  threshold: number | null;
  expectedObserved: string;
  expectedThreshold: string;
}>;

const FORMATTING_CASES = [
  {
    name: "spread percentage with zero and negative threshold",
    anomalyType: "spread_spike",
    observed: 0,
    threshold: -1.25,
    expectedObserved: "0.000%",
    expectedThreshold: "-1.250%",
  },
  {
    name: "price-move percentage",
    anomalyType: "price_move",
    observed: -0.125,
    threshold: 0,
    expectedObserved: "-0.125%",
    expectedThreshold: "0.000%",
  },
  {
    name: "event-lag duration",
    anomalyType: "event_lag_spike",
    observed: 1_500,
    threshold: 999.5,
    expectedObserved: "1.5 s",
    expectedThreshold: "999.5 ms",
  },
  {
    name: "stale-data duration with a negative value",
    anomalyType: "stale_data",
    observed: 0,
    threshold: -250,
    expectedObserved: "0 ms",
    expectedThreshold: "-250 ms",
  },
  {
    name: "quote-stuck duration",
    anomalyType: "quote_stuck",
    observed: 1_000,
    threshold: 2_500,
    expectedObserved: "1.0 s",
    expectedThreshold: "2.5 s",
  },
  {
    name: "trade burst integer rate",
    anomalyType: "trade_burst",
    observed: 1_234.4,
    threshold: -2,
    expectedObserved: "1,234 /m",
    expectedThreshold: "-2 /m",
  },
  {
    name: "depth sequence gap roles",
    anomalyType: "depth_sequence_gap",
    observed: 0,
    threshold: -2,
    expectedObserved: "0 gap",
    expectedThreshold: "-2 limit",
  },
  {
    name: "generic detector numeric values",
    anomalyType: "custom_detector",
    observed: 1_234.5678,
    threshold: -0.1254,
    expectedObserved: "1,234.568",
    expectedThreshold: "-0.125",
  },
  {
    name: "null numeric values",
    anomalyType: "custom_detector",
    observed: null,
    threshold: null,
    expectedObserved: "—",
    expectedThreshold: "—",
  },
  {
    name: "NaN numeric values",
    anomalyType: "custom_detector",
    observed: Number.NaN,
    threshold: Number.NaN,
    expectedObserved: "—",
    expectedThreshold: "—",
  },
] as const satisfies readonly FormattingCase[];

describe("RecentAnomaliesDesktopTable formatting", () => {
  it.each(FORMATTING_CASES)(
    "preserves $name",
    ({ anomalyType, observed, threshold, expectedObserved, expectedThreshold }) => {
      renderTable([
        previewRow(1, {
          anomaly_type: anomalyType,
          observed_value: observed,
          threshold_value: threshold,
        }),
      ]);

      const cells = within(
        screen.getByRole("button", {
          name: "Open BTCUSDT market detail",
        }),
      ).getAllByRole("cell");

      expect(cells[4]).toHaveTextContent(expectedObserved);
      expect(cells[5]).toHaveTextContent(expectedThreshold);
    },
  );
});

describe("RecentAnomaliesDesktopTable ownership and scope", () => {
  it("does not reorder, limit, mutate, or apply duplicate-symbol policy", () => {
    const rows = Object.freeze(
      Array.from({ length: 9 }, (_, index) =>
        Object.freeze(
          previewRow(index + 1, {
            symbol: index < 2 ? "BTCUSDT" : `MARKET${index}`,
            event_time: `2026-07-20T10:00:${String(index).padStart(2, "0")}.000Z`,
          }),
        ),
      ),
    );
    const before = JSON.stringify(rows);

    renderTable(rows);

    const renderedRows = screen.getAllByRole("button");
    expect(renderedRows).toHaveLength(9);
    expect(renderedRows.map((row) => row.getAttribute("aria-label"))).toEqual(
      rows.map((row) => `Open ${row.symbol} market detail`),
    );
    expect(
      renderedRows.filter(
        (row) => row.getAttribute("aria-label") === "Open BTCUSDT market detail",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(rows)).toBe(before);
    expect(source).not.toMatch(/\.sort\s*\(/);
    expect(source).not.toMatch(/\.slice\s*\(/);
    expect(source).not.toMatch(/new\s+Set\s*(?:<|\()/);
    expect(source).not.toMatch(/duplicate/i);
    expect(source).not.toMatch(/\bthrow\b/);
  });

  it("contains no shell, mobile, view-all, modal, or Wave 4 markup", () => {
    const row = previewRow(1, {
      message: "This context must remain outside the desktop table.",
      severity: "critical",
    });

    renderTable([row]);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("View all")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Latest data-quality events across monitored markets."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No anomalies detected in the current summary."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.queryByText(row.message)).not.toBeInTheDocument();
    expect(screen.queryByText(row.activeLabel)).not.toBeInTheDocument();
    expect(
      screen.queryByText(row.severityDescriptor.description),
    ).not.toBeInTheDocument();
    expect(source).not.toMatch(/AnomalyCard|SectionTitle|LoadingSkeleton|EmptyBlock/);
    expect(source).not.toMatch(/View all|Latest data-quality events/);
    expect(source).not.toMatch(/Tooltip|role=["']tooltip["']|title=/);
    expect(source).not.toMatch(/\.message\b|\.activeLabel\b|\.description\b/);
  });

  it("consumes only the accepted preview model and deterministic input values", () => {
    expect(source).toContain(
      'import type { RecentAnomaliesPreviewRow } from "./recentAnomaliesPreviewModel";',
    );
    expect(source).not.toMatch(/DashboardSummary|DashboardAnomaly/);
    expect(source).not.toMatch(/formatDetectorLabel|getAnomalySeverityDescriptor/);
    expect(source).not.toMatch(/recent_anomalies|anomaly_type|observed_value/);
    expect(source).not.toMatch(/from\s+["']@\/features\/dashboard\/api["']/);
    expect(source).not.toMatch(/@tanstack\/react-query|react-router/);
    expect(source).not.toMatch(/symbolPopup|useQuery|useNavigate/);
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random|setTimeout|setInterval|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toMatch(/\b(?:any|@ts-ignore|TODO|FIXME)\b/);
  });
});

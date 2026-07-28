import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  mapDashboardAnomalyToRecentPreviewRow,
  type RecentAnomaliesPreviewRow,
} from "./recentAnomaliesPreviewModel";
import { RecentAnomaliesMobileCards } from "./RecentAnomaliesMobileCards";
import type { DashboardAnomaly } from "./types";

const sourcePath = path.join(
  process.cwd(),
  "src/features/dashboard/RecentAnomaliesMobileCards.tsx",
);
const source = readFileSync(sourcePath, "utf8");

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

function metricValue(card: HTMLElement, label: string): string | null {
  const labelElement = within(card).getByText(label, { selector: "p" });
  const paragraphs = labelElement.parentElement?.querySelectorAll("p");

  return paragraphs?.[1]?.textContent ?? null;
}

describe("RecentAnomaliesMobileCards presentation", () => {
  it("preserves the exact mobile wrapper, full-width button, market, and detector classes", () => {
    const { container } = render(
      <RecentAnomaliesMobileCards
        rows={[row()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveAttribute(
      "class",
      "divide-y divide-white/10 border-y border-white/10 lg:hidden",
    );

    const card = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    expect(card).toHaveAttribute(
      "class",
      "block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
    );
    expect(within(card).getByText("BTCUSDT")).toHaveAttribute(
      "class",
      "font-mono text-base font-bold text-white transition",
    );
    expect(within(card).getByText("Spread Spike")).toHaveAttribute(
      "class",
      "mt-2 text-base font-bold text-slate-100",
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
      <RecentAnomaliesMobileCards
        rows={rows}
        onOpenSymbolDetail={onOpenSymbolDetail}
      />,
    );

    expect(
      screen
        .getAllByRole("button")
        .map((card) => card.getAttribute("aria-label")),
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

  it("uses stable UUID identity rather than array position", () => {
    const btc = row({ id: ids[0], symbol: "BTCUSDT" });
    const eth = row({ id: ids[1], symbol: "ETHUSDT" });
    const { rerender } = render(
      <RecentAnomaliesMobileCards
        rows={[btc, eth]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );
    const originalBtcCard = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });

    rerender(
      <RecentAnomaliesMobileCards
        rows={[eth, btc]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
    ).toBe(originalBtcCard);
    expect(source).toMatch(/key=\{row\.id\}/);
    expect(source).not.toMatch(
      /key=\{(?:index|row\.(?:symbol|message|eventTime|createdAt))\}/,
    );
  });

  it("renders accepted detector labels without reconstructing them", () => {
    const acceptedRow = {
      ...row({ anomaly_type: "custom_detector" }),
      detectorLabel: "Accepted Detector Label",
    };

    render(
      <RecentAnomaliesMobileCards
        rows={[acceptedRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(screen.getByText("Accepted Detector Label")).toBeInTheDocument();
    expect(screen.queryByText("Custom Detector")).not.toBeInTheDocument();
  });

  it("renders exact accessible labels and metric labels", () => {
    render(
      <RecentAnomaliesMobileCards
        rows={[row()]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });

    for (const label of ["Observed", "Threshold", "Time", "Severity"]) {
      expect(within(card).getByText(label, { selector: "p" })).toBeInTheDocument();
    }
  });

  it.each([
    {
      severity: "info" as const,
      label: "Info",
      badgeClass:
        "inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2.5 py-1 text-xs tracking-[0.12em] border-sky-400/35 bg-sky-400/10 text-sky-200",
      metricClass: "mt-1 text-sm font-bold text-sky-200",
    },
    {
      severity: "warning" as const,
      label: "Warning",
      badgeClass:
        "inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2.5 py-1 text-xs tracking-[0.12em] border-amber-400/35 bg-amber-400/10 text-amber-200",
      metricClass: "mt-1 text-sm font-bold text-amber-300",
    },
    {
      severity: "critical" as const,
      label: "Critical",
      badgeClass:
        "inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2.5 py-1 text-xs tracking-[0.12em] border-rose-400/35 bg-rose-400/10 text-rose-200",
      metricClass: "mt-1 text-sm font-bold text-rose-300",
    },
  ])(
    "uses accepted $severity descriptor label and current classes",
    ({ severity, label, badgeClass, metricClass }) => {
      render(
        <RecentAnomaliesMobileCards
          rows={[row({ severity })]}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      const card = screen.getByRole("button");
      expect(within(card).getByText(label, { selector: "span" })).toHaveAttribute(
        "class",
        badgeClass,
      );
      expect(within(card).getByText(label, { selector: "p" })).toHaveAttribute(
        "class",
        metricClass,
      );
    },
  );

  it("uses event time when truthy and created-at as the fallback", () => {
    const eventTime = "2026-07-28T10:11:12.000Z";
    const createdAt = "2026-07-28T03:04:05.000Z";
    const eventRow = row({ id: ids[0], symbol: "BTCUSDT", event_time: eventTime });
    const fallbackRow = {
      ...row({ id: ids[1], symbol: "ETHUSDT", created_at: createdAt }),
      eventTime: "",
    };

    render(
      <RecentAnomaliesMobileCards
        rows={[eventRow, fallbackRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(
      metricValue(
        screen.getByRole("button", { name: "Open BTCUSDT market detail" }),
        "Time",
      ),
    ).toBe(expectedTime(eventTime));
    expect(
      metricValue(
        screen.getByRole("button", { name: "Open ETHUSDT market detail" }),
        "Time",
      ),
    ).toBe(expectedTime(createdAt));
  });

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
        <RecentAnomaliesMobileCards
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

      const card = screen.getByRole("button");
      expect(metricValue(card, "Observed")).toBe(observed);
      expect(metricValue(card, "Threshold")).toBe(threshold);
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
      <RecentAnomaliesMobileCards
        rows={[nullRow, nanRow, undefinedRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    for (const name of [
      "Open BTCUSDT market detail",
      "Open ETHUSDT market detail",
      "Open SOLUSDT market detail",
    ]) {
      const card = screen.getByRole("button", { name });
      expect(metricValue(card, "Observed")).toBe("—");
      expect(metricValue(card, "Threshold")).toBe("—");
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
        <RecentAnomaliesMobileCards
          rows={frozenRows}
          onOpenSymbolDetail={vi.fn()}
        />,
      );

      expect(screen.getAllByRole("button")).toHaveLength(8);
      expect(
        screen
          .getAllByRole("button")
          .map((card) => card.getAttribute("aria-label")),
      ).toEqual(
        frozenRows.map((entry) => `Open ${entry.symbol} market detail`),
      );
      expect(JSON.stringify(frozenRows)).toBe(before);
      unmount();

      expect(() =>
        render(
          <RecentAnomaliesMobileCards
            rows={duplicateRows}
            onOpenSymbolDetail={vi.fn()}
          />,
        ),
      ).not.toThrow();
      expect(screen.getAllByRole("button")).toHaveLength(2);
    } finally {
      consoleError.mockRestore();
    }

    expect(source).not.toMatch(/\.(?:sort|slice|splice|reverse)\s*\(/);
    expect(source).not.toMatch(/\b(?:Set|Map)\s*</);
  });

  it("renders only the leased preview-card semantics and has no external behavior dependencies", () => {
    const previewRow = row({
      message: "Hidden context message",
      anomaly_type: "spread_spike",
    });
    const { container } = render(
      <RecentAnomaliesMobileCards
        rows={[previewRow]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector("[title]")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Anomalies")).not.toBeInTheDocument();
    expect(screen.queryByText("View all")).not.toBeInTheDocument();
    expect(screen.queryByText("Hidden context message")).not.toBeInTheDocument();
    expect(screen.queryByText(previewRow.activeLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(previewRow.severityDescriptor.description)).not.toBeInTheDocument();

    expect(source.match(/^import\s/mg)).toHaveLength(1);
    expect(source).toMatch(
      /^import type \{ RecentAnomaliesPreviewRow \} from "\.\/recentAnomaliesPreviewModel";/m,
    );
    expect(source).not.toMatch(
      /from\s+["'](?:react-router|@tanstack|\.\/api|\.\/symbolPopup)/,
    );
    expect(source).not.toMatch(
      /\b(?:fetch|XMLHttpRequest|WebSocket|Date\.now|Math\.random|setTimeout|setInterval|window|document|navigator|localStorage|sessionStorage)\b/,
    );
    expect(source).not.toMatch(/\b(?:message|activeLabel|effectiveTimestampMs)\b/);
    expect(source).not.toMatch(/\b(?:Tooltip|Modal|View all|Loading|Empty)\b/);
  });
});

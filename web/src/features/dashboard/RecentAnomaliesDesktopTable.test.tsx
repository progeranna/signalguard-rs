import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  mapDashboardAnomalyToRecentPreviewRow,
  type RecentAnomaliesPreviewRow,
} from "./recentAnomaliesPreviewModel";
import { RecentAnomaliesDesktopTable } from "./RecentAnomaliesDesktopTable";
import type { DashboardAnomaly } from "./types";

const IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
] as const;

function row(overrides: Partial<DashboardAnomaly> = {}): RecentAnomaliesPreviewRow {
  return mapDashboardAnomalyToRecentPreviewRow({
    id: IDS[0],
    symbol: "BTCUSDT",
    anomaly_type: "spread_spike",
    severity: "warning",
    message: "Accepted context",
    observed_value: 1.25,
    threshold_value: 0.5,
    event_time: "2026-07-28T10:11:12.000Z",
    created_at: "2026-07-28T09:08:07.000Z",
    ...overrides,
  });
}

function labelFor(entry: RecentAnomaliesPreviewRow): string {
  return `Open ${entry.symbol} ${entry.detectorLabel} anomaly detail ${entry.id}`;
}

describe("RecentAnomaliesDesktopTable modal activation", () => {
  it("preserves the accepted desktop table structure and presentation", () => {
    const entry = row();
    render(
      <RecentAnomaliesDesktopTable
        rows={[entry]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );

    const table = screen.getByRole("table", { name: "Recent anomalies" });
    expect(
      within(table).getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Time", "Market", "Type", "Severity", "Observed", "Threshold"]);
    const control = screen.getByRole("button", { name: labelFor(entry) });
    expect(control.tagName).toBe("TR");
    expect(control).toHaveAttribute("tabindex", "0");
    expect(within(control).getByText("BTCUSDT")).toBeInTheDocument();
    expect(within(control).getByText("Spread Spike")).toBeInTheDocument();
  });

  it("activates the exact UUID by click, Enter, and Space", () => {
    const onOpenAnomalyDetail = vi.fn();
    const entry = row();
    render(
      <RecentAnomaliesDesktopTable
        rows={[entry]}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />,
    );
    const control = screen.getByRole("button", { name: labelFor(entry) });

    fireEvent.click(control);
    fireEvent.keyDown(control, { key: "Enter" });
    fireEvent.keyDown(control, { key: " " });
    fireEvent.keyDown(control, { key: "ArrowDown" });

    expect(onOpenAnomalyDetail).toHaveBeenCalledTimes(3);
    expect(onOpenAnomalyDetail.mock.calls).toEqual([
      [IDS[0]],
      [IDS[0]],
      [IDS[0]],
    ]);
  });

  it("keeps same-symbol anomalies independently selectable by UUID", () => {
    const onOpenAnomalyDetail = vi.fn();
    const first = row({ id: IDS[0], message: "First" });
    const second = row({ id: IDS[1], message: "Second" });
    render(
      <RecentAnomaliesDesktopTable
        rows={[first, second]}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: labelFor(second) }));
    fireEvent.click(screen.getByRole("button", { name: labelFor(first) }));

    expect(onOpenAnomalyDetail.mock.calls).toEqual([[IDS[1]], [IDS[0]]]);
  });

  it("uses UUID keys so reordering preserves the exact row nodes", () => {
    const first = row({ id: IDS[0] });
    const second = row({ id: IDS[1], symbol: "ETHUSDT" });
    const view = render(
      <RecentAnomaliesDesktopTable
        rows={[first, second]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );
    const firstNode = screen.getByRole("button", { name: labelFor(first) });

    view.rerender(
      <RecentAnomaliesDesktopTable
        rows={[second, first]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: labelFor(first) })).toBe(firstNode);
  });

  it("preserves zero and renders null values with the accepted em dash", () => {
    const zero = row({ id: IDS[0], observed_value: 0, threshold_value: 0 });
    const missing = row({
      id: IDS[1],
      symbol: "ETHUSDT",
      observed_value: null,
      threshold_value: null,
    });
    render(
      <RecentAnomaliesDesktopTable
        rows={[zero, missing]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );

    const zeroCells = within(screen.getByRole("button", { name: labelFor(zero) }))
      .getAllByRole("cell");
    const missingCells = within(
      screen.getByRole("button", { name: labelFor(missing) }),
    ).getAllByRole("cell");
    expect(zeroCells[4]).toHaveTextContent("0.000%");
    expect(zeroCells[5]).toHaveTextContent("0.000%");
    expect(missingCells[4]).toHaveTextContent("—");
    expect(missingCells[5]).toHaveTextContent("—");
  });
});

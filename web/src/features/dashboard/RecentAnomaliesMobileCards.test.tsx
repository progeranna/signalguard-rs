import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  mapDashboardAnomalyToRecentPreviewRow,
  type RecentAnomaliesPreviewRow,
} from "./recentAnomaliesPreviewModel";
import { RecentAnomaliesMobileCards } from "./RecentAnomaliesMobileCards";
import type { DashboardAnomaly } from "./types";

const IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
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

describe("RecentAnomaliesMobileCards modal activation", () => {
  it("renders the accepted responsive card and an anomaly-detail label", () => {
    const entry = row();
    render(
      <RecentAnomaliesMobileCards
        rows={[entry]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: labelFor(entry) });
    expect(card).toHaveAttribute("type", "button");
    expect(within(card).getByText("BTCUSDT")).toBeInTheDocument();
    expect(within(card).getByText("Spread Spike")).toBeInTheDocument();
    for (const label of ["Observed", "Threshold", "Time", "Severity"]) {
      expect(within(card).getByText(label, { selector: "p" })).toBeInTheDocument();
    }
    expect(card.getAttribute("aria-label")).not.toMatch(/market detail/i);
  });

  it("activates the exact UUID on mobile", () => {
    const onOpenAnomalyDetail = vi.fn();
    const first = row({ id: IDS[0] });
    const second = row({ id: IDS[1] });
    render(
      <RecentAnomaliesMobileCards
        rows={[first, second]}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: labelFor(second) }));
    fireEvent.click(screen.getByRole("button", { name: labelFor(first) }));

    expect(onOpenAnomalyDetail.mock.calls).toEqual([[IDS[1]], [IDS[0]]]);
  });

  it("uses UUID keys across reordering", () => {
    const first = row({ id: IDS[0] });
    const second = row({ id: IDS[1], symbol: "ETHUSDT" });
    const view = render(
      <RecentAnomaliesMobileCards
        rows={[first, second]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );
    const firstNode = screen.getByRole("button", { name: labelFor(first) });

    view.rerender(
      <RecentAnomaliesMobileCards
        rows={[second, first]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: labelFor(first) })).toBe(firstNode);
  });

  it("preserves zero and null value presentation", () => {
    const zero = row({ id: IDS[0], observed_value: 0, threshold_value: 0 });
    const missing = row({
      id: IDS[1],
      symbol: "ETHUSDT",
      observed_value: null,
      threshold_value: null,
    });
    render(
      <RecentAnomaliesMobileCards
        rows={[zero, missing]}
        onOpenAnomalyDetail={vi.fn()}
      />,
    );

    expect(within(screen.getByRole("button", { name: labelFor(zero) })).getAllByText("0.000%"))
      .toHaveLength(2);
    expect(within(screen.getByRole("button", { name: labelFor(missing) })).getAllByText("—"))
      .toHaveLength(2);
  });
});

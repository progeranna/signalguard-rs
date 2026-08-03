import { readFileSync } from "node:fs";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketAnomalyViewModel } from "./marketViewModel";
import { SymbolDetailAnomalies } from "./SymbolDetailAnomalies";
import { requireSymbolId } from "./symbolId";

const symbol = requireSymbolId("BTCUSDT");

function anomaly(id: string, severity: MarketAnomalyViewModel["severity"]["key"]): MarketAnomalyViewModel {
  const text = severity[0].toUpperCase() + severity.slice(1);
  return {
    id,
    symbol,
    type: `${text} anomaly ${id}`,
    severity: { key: severity, text, tone: severity },
    observed: `${id} observed`,
    threshold: `${id} threshold`,
    detected: `${id} detected`,
    detectedAt: "unused",
    context: `${id} context`,
    valueClassName: `value-${severity}`,
  };
}

const fixtures = [
  anomaly("critical-id", "critical"),
  anomaly("warning-id", "warning"),
  anomaly("info-id", "info"),
] as const;

function renderAnomalies(anomalies: readonly MarketAnomalyViewModel[] = fixtures) {
  return render(
    <SymbolDetailAnomalies
      symbol={symbol}
      anomalies={anomalies}
      onOpenAnomalyDetail={() => undefined}
    />,
  );
}

describe("SymbolDetailAnomalies popup-only presentation", () => {
  it("renders popup heading, columns, accepted values, and severity badges", () => {
    renderAnomalies();
    expect(
      screen.getByRole("heading", { level: 3, name: "Recent market anomalies" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("table")).getAllByRole("columnheader")
        .map((node) => node.textContent),
    ).toEqual(["Type", "Severity", "Observed", "Threshold", "Detected", "Context"]);

    for (const item of fixtures) {
      const row = within(screen.getByRole("table")).getByText(item.type).closest("tr");
      expect(row).toHaveTextContent(item.observed);
      expect(row).toHaveTextContent(item.threshold);
      expect(row).toHaveTextContent(item.detected);
      expect(row).toHaveTextContent(item.context);
    }
    expect(screen.getAllByText("Critical")[0]).toHaveClass("border-rose-400/35");
    expect(screen.getAllByText("Warning")[0]).toHaveClass("border-amber-400/35");
    expect(screen.getAllByText("Info")[0]).toHaveClass("border-sky-400/35");
  });

  it("keeps desktop and mobile nodes keyed by exact anomaly ID", () => {
    const first = anomaly("first-id", "warning");
    const second = anomaly("second-id", "info");
    const view = renderAnomalies([first, second]);
    const firstRow = within(screen.getByRole("table")).getByText(first.type).closest("tr");
    const firstMobileButton = screen.getAllByRole("button", {
      name: /first-id anomaly detail first-id$/,
    })[1];

    view.rerender(
      <SymbolDetailAnomalies
        symbol={symbol}
        anomalies={[second, first]}
        onOpenAnomalyDetail={() => undefined}
      />,
    );
    expect(within(screen.getByRole("table")).getByText(first.type).closest("tr"))
      .toBe(firstRow);
    expect(screen.getAllByRole("button", {
      name: /first-id anomaly detail first-id$/,
    })[1]).toBe(firstMobileButton);
  });

  it.each([
    ["click", (element: HTMLElement) => fireEvent.click(element)],
    ["Enter", (element: HTMLElement) => fireEvent.keyDown(element, { key: "Enter" })],
    ["Space", (element: HTMLElement) => fireEvent.keyDown(element, { key: " " })],
  ] as const)("opens the exact desktop anomaly UUID with %s", (_input, activate) => {
    const onOpenAnomalyDetail = vi.fn();
    render(
      <SymbolDetailAnomalies
        symbol={symbol}
        anomalies={[fixtures[0]]}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />,
    );
    const [desktopRow] = screen.getAllByRole("button", {
      name: /Open BTCUSDT Critical anomaly critical-id anomaly detail critical-id/,
    });
    activate(desktopRow!);
    expect(onOpenAnomalyDetail).toHaveBeenCalledWith("critical-id");
  });

  it("opens the exact mobile anomaly UUID and never exposes market-detail activation", () => {
    const onOpenAnomalyDetail = vi.fn();
    render(
      <SymbolDetailAnomalies
        symbol={symbol}
        anomalies={[fixtures[0]]}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />,
    );
    const controls = screen.getAllByRole("button", {
      name: /Open BTCUSDT Critical anomaly critical-id anomaly detail critical-id/,
    });
    expect(controls).toHaveLength(2);
    expect(controls[0]).toHaveAttribute("data-anomaly-id", "critical-id");
    expect(controls[1]).toHaveAttribute("data-anomaly-id", "critical-id");
    fireEvent.click(controls[1]!);
    expect(onOpenAnomalyDetail).toHaveBeenCalledWith("critical-id");
    expect(screen.queryByLabelText(/market detail/i)).not.toBeInTheDocument();
  });

  it("renders the accepted empty state", () => {
    renderAnomalies([]);
    expect(screen.getByText("No recent anomalies for this market.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("retains input order without mutation or external data ownership", () => {
    const input = Object.freeze([...fixtures]);
    const snapshot = JSON.stringify(input);
    renderAnomalies(input);
    expect(
      Array.from(screen.getByRole("table").querySelectorAll("tbody tr"))
        .map((row) => row.querySelector("td")?.textContent),
    ).toEqual(input.map((item) => item.type));
    expect(JSON.stringify(input)).toBe(snapshot);

    const source = readFileSync("src/features/dashboard/SymbolDetailAnomalies.tsx", "utf8");
    expect(source).not.toMatch(/react-router|@tanstack|fetch\s*\(/);
    expect(source).not.toMatch(/anomalies\s*\.\s*(?:filter|sort|slice|splice)\s*\(/);
  });
});

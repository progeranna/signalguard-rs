import { readFileSync } from "node:fs";
import path from "node:path";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MarketAnomalyViewModel } from "./marketViewModel";
import { SymbolDetailAnomalies } from "./SymbolDetailAnomalies";
import { requireSymbolId } from "./symbolId";

const source = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/SymbolDetailAnomalies.tsx"),
  "utf8",
);
const symbol = requireSymbolId("BTCUSDT");

function anomaly(
  id: string,
  severity: MarketAnomalyViewModel["severity"]["key"],
): MarketAnomalyViewModel {
  const text = severity[0].toUpperCase() + severity.slice(1);

  return {
    id,
    symbol,
    type: `${text} anomaly type`,
    severity: { key: severity, text, tone: severity },
    observed: { route: `${id} route observed`, popup: `${id} popup observed` },
    threshold: { route: `${id} route threshold`, popup: `${id} popup threshold` },
    detected: `${id} popup detected`,
    detectedAt: `${id} route detected at`,
    context: `${id} context`,
    valueClassName: `value-${severity}`,
  };
}

const fixtures = [
  anomaly("anomaly-critical", "critical"),
  anomaly("anomaly-warning", "warning"),
  anomaly("anomaly-info", "info"),
] as const;

function renderRoute(anomalies: readonly MarketAnomalyViewModel[] = fixtures) {
  return render(
    <SymbolDetailAnomalies
      variant="route"
      symbol={symbol}
      anomalies={anomalies}
    />,
  );
}

function renderPopup(
  anomalies: readonly MarketAnomalyViewModel[] = fixtures,
  onOpenSymbolDetail = vi.fn(),
) {
  return render(
    <SymbolDetailAnomalies
      variant="popup"
      symbol={symbol}
      anomalies={anomalies}
      onOpenSymbolDetail={onOpenSymbolDetail}
    />,
  );
}

function tableHeaders(): string[] {
  const table = screen.getByRole("table");
  return Array.from(table.querySelectorAll("thead th"), (header) =>
    header.textContent?.trim() ?? "",
  );
}

describe("SymbolDetailAnomalies presentation boundary", () => {
  it("renders the exact route title and subtitle", () => {
    renderRoute();

    expect(
      screen.getByRole("heading", { level: 2, name: "Recent anomalies for BTCUSDT" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Latest quality events for the selected market."),
    ).toBeInTheDocument();
  });

  it("renders the exact popup title and subtitle", () => {
    renderPopup();

    expect(
      screen.getByRole("heading", { level: 3, name: "Recent market anomalies" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quality events for this market in the current summary."),
    ).toBeInTheDocument();
  });

  it.each([
    ["route", "Detected at"],
    ["popup", "Detected"],
  ] as const)("preserves the %s desktop column order", (variant, detectedLabel) => {
    if (variant === "route") {
      renderRoute();
    } else {
      renderPopup();
    }

    expect(tableHeaders()).toEqual([
      "Type",
      "Severity",
      "Observed",
      "Threshold",
      detectedLabel,
      "Context",
    ]);
  });

  it("renders exact route view-model fields, severity tones, and route classes", () => {
    const { container } = renderRoute();
    const table = screen.getByRole("table");

    for (const fixture of fixtures) {
      const row = within(table).getByText(fixture.type).closest("tr");
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent(fixture.observed.route);
      expect(row).toHaveTextContent(fixture.threshold.route);
      expect(row).toHaveTextContent(fixture.detectedAt);
      expect(row).toHaveTextContent(fixture.context);
      expect(within(row as HTMLElement).getByText(fixture.severity.text)).toHaveClass(
        "inline-flex",
      );
    }

    expect(container.querySelector(".lg\\:block")).toHaveClass("hidden");
    expect(container.querySelector(".lg\\:hidden")).toHaveClass("lg:hidden");
    expect(container.querySelectorAll("button, a")).toHaveLength(0);
    for (const [text, className] of [
      ["Critical", "text-rose-100"],
      ["Warning", "text-amber-100"],
      ["Info", "text-sky-100"],
    ] as const) {
      for (const badge of screen.getAllByText(text)) {
        expect(badge).toHaveClass(className);
      }
    }
  });

  it("renders exact popup view-model fields, value classes, and severity mapping", () => {
    const { container } = renderPopup();
    const table = screen.getByRole("table");

    for (const fixture of fixtures) {
      const row = within(table).getByText(fixture.type).closest("tr");
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent(fixture.observed.popup);
      expect(row).toHaveTextContent(fixture.threshold.popup);
      expect(row).toHaveTextContent(fixture.detected);
      expect(row).toHaveTextContent(fixture.context);
      expect(within(row as HTMLElement).getByText(fixture.observed.popup)).toHaveClass(
        fixture.valueClassName,
      );
    }

    expect(container.querySelector(".lg\\:block")).toHaveClass("hidden");
    expect(container.querySelector(".lg\\:hidden")).toHaveClass("lg:hidden");
    expect(within(table).getByText("Critical")).toHaveClass("border-rose-400/35");
    expect(within(table).getByText("Warning")).toHaveClass("border-amber-400/35");
    expect(within(table).getByText("Info")).toHaveClass("border-sky-400/35");
  });

  it("preserves route timestamp and popup metric label presentation classes", () => {
    const route = renderRoute([fixtures[0]]);
    const routeTimestamp = Array.from(route.container.querySelectorAll("p")).find(
      (element) => element.textContent === fixtures[0].detectedAt,
    );

    expect(routeTimestamp).toBeInstanceOf(HTMLParagraphElement);
    if (!routeTimestamp) {
      throw new Error("Expected the route detected timestamp paragraph");
    }
    expect(routeTimestamp.className).toBe(
      "mt-1 text-xs uppercase tracking-[0.14em] text-slate-500",
    );
    expect(routeTimestamp).not.toHaveClass("font-semibold");

    route.unmount();
    const popup = renderPopup([fixtures[0]]);
    const popupMetricLabel = Array.from(popup.container.querySelectorAll("p")).find(
      (element) => element.textContent === "Observed",
    );

    expect(popupMetricLabel).toBeInstanceOf(HTMLParagraphElement);
    if (!popupMetricLabel) {
      throw new Error("Expected the popup observed metric label paragraph");
    }
    expect(popupMetricLabel.className).toBe(
      "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500",
    );
  });

  it("uses anomaly IDs for both desktop and mobile list identity", () => {
    expect(source).toContain("<AnomalyDesktopTable variant={props.variant}");
    expect(source).toContain('variant="route"');
    expect(source).toContain('variant="popup"');
    expect(source).toContain("<AnomalyDesktopRow key={anomaly.id}");
    expect(source).toContain("<AnomalyMobileItem key={anomaly.id}");
    expect(source).toContain("key={anomaly.id}");
  });

  it("preserves input order without mutating the anomaly array", () => {
    const input = fixtures.map((fixture) => Object.freeze({ ...fixture }));
    const inputSnapshot = input.map((fixture) => ({ ...fixture }));

    renderRoute(input);

    const rows = Array.from(screen.getByRole("table").querySelectorAll("tbody tr"));
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual(
      input.map((fixture) => fixture.type),
    );
    expect(input).toEqual(inputSnapshot);
  });

  it("renders the exact empty state for both variants", () => {
    const { rerender } = renderRoute([]);
    expect(screen.getByText("No recent anomalies for this market.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    rerender(
      <SymbolDetailAnomalies
        variant="popup"
        symbol={symbol}
        anomalies={[]}
        onOpenSymbolDetail={vi.fn()}
      />,
    );
    expect(screen.getByText("No recent anomalies for this market.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps popup mobile cards interactive with native keyboard-capable buttons", () => {
    const onOpenSymbolDetail = vi.fn();
    renderPopup([fixtures[0]], onOpenSymbolDetail);

    const card = screen.getByRole("button", {
      name: "Open BTCUSDT market detail",
    });
    expect(card).toHaveAttribute("type", "button");
    card.focus();
    expect(card).toHaveFocus();
    fireEvent.click(card);
    expect(onOpenSymbolDetail).toHaveBeenCalledOnce();
    expect(onOpenSymbolDetail).toHaveBeenCalledWith(fixtures[0].symbol);
  });

  it("does not own data, routing, popup state, mode, or browser-storage concerns", () => {
    for (const forbidden of [
      "fetch(",
      "useQuery",
      "filter(",
      "sort(",
      ".slice(",
      "adaptMarket",
      "useNavigate",
      "navigate(",
      "useState",
      "useEffect",
      "localStorage",
      "sessionStorage",
      "mode",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

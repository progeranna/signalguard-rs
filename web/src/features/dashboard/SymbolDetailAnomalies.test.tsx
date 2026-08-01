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
  anomalySymbol = symbol,
): MarketAnomalyViewModel {
  const text = severity[0].toUpperCase() + severity.slice(1);

  return {
    id,
    symbol: anomalySymbol,
    type: `${text} anomaly type ${id}`,
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

function desktopRowFor(item: MarketAnomalyViewModel): HTMLTableRowElement {
  const row = within(screen.getByRole("table")).getByText(item.type).closest("tr");

  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`Expected desktop row for ${item.id}`);
  }

  return row;
}

function routeMobileItemFor(item: MarketAnomalyViewModel): HTMLElement {
  const article = screen
    .getAllByRole("article")
    .find((candidate) => within(candidate).queryByText(item.type));

  if (!article) {
    throw new Error(`Expected route mobile item for ${item.id}`);
  }

  return article;
}

function popupMobileItemFor(item: MarketAnomalyViewModel): HTMLButtonElement {
  return screen.getByRole("button", {
    name: `Open ${item.symbol} market detail`,
  });
}

function staticImportSpecifiers(componentSource: string): string[] {
  return Array.from(
    componentSource.matchAll(
      /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/g,
    ),
    (match) => match[1]!,
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

  it.each(["route", "popup"] as const)(
    "keeps %s desktop and mobile nodes attached to anomaly IDs across reordering",
    (variant) => {
      const first = Object.freeze(
        anomaly("identity-btc", "critical", requireSymbolId("BTCUSDT")),
      );
      const second = Object.freeze(
        anomaly("identity-eth", "warning", requireSymbolId("ETHUSDT")),
      );
      const input = Object.freeze([first, second]);
      const reversed = Object.freeze([second, first]);

      if (variant === "route") {
        const view = renderRoute(input);
        const firstDesktop = desktopRowFor(first);
        const secondDesktop = desktopRowFor(second);
        const firstMobile = routeMobileItemFor(first);
        const secondMobile = routeMobileItemFor(second);

        view.rerender(
          <SymbolDetailAnomalies
            variant="route"
            symbol={symbol}
            anomalies={reversed}
          />,
        );

        expect(desktopRowFor(first)).toBe(firstDesktop);
        expect(desktopRowFor(second)).toBe(secondDesktop);
        expect(routeMobileItemFor(first)).toBe(firstMobile);
        expect(routeMobileItemFor(second)).toBe(secondMobile);
        expect(screen.getAllByRole("article")).toEqual([secondMobile, firstMobile]);
      } else {
        const onOpenSymbolDetail = vi.fn();
        const view = renderPopup(input, onOpenSymbolDetail);
        const firstDesktop = desktopRowFor(first);
        const secondDesktop = desktopRowFor(second);
        const firstMobile = popupMobileItemFor(first);
        const secondMobile = popupMobileItemFor(second);

        view.rerender(
          <SymbolDetailAnomalies
            variant="popup"
            symbol={symbol}
            anomalies={reversed}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />,
        );

        expect(desktopRowFor(first)).toBe(firstDesktop);
        expect(desktopRowFor(second)).toBe(secondDesktop);
        expect(popupMobileItemFor(first)).toBe(firstMobile);
        expect(popupMobileItemFor(second)).toBe(secondMobile);
        expect(screen.getAllByRole("button")).toEqual([secondMobile, firstMobile]);
      }
    },
  );

  it("preserves every frozen anomaly in input order without limiting, deduplicating, or mutation", () => {
    const input = Object.freeze(
      Array.from({ length: 8 }, (_, index) =>
        Object.freeze(
          anomaly(
            `ordered-${index}`,
            index % 2 === 0 ? "warning" : "info",
          ),
        ),
      ),
    );
    const snapshot = JSON.stringify(input);

    const route = renderRoute(input);
    const routeRows = Array.from(
      screen.getByRole("table").querySelectorAll("tbody tr"),
    );
    expect(routeRows.map((row) => row.querySelector("td")?.textContent)).toEqual(
      input.map((fixture) => fixture.type),
    );
    expect(screen.getAllByRole("article")).toHaveLength(input.length);
    expect(JSON.stringify(input)).toBe(snapshot);

    route.unmount();
    renderPopup(input);
    const popupRows = Array.from(
      screen.getByRole("table").querySelectorAll("tbody tr"),
    );
    expect(popupRows.map((row) => row.querySelector("td")?.textContent)).toEqual(
      input.map((fixture) => fixture.type),
    );
    expect(screen.getAllByRole("button")).toHaveLength(input.length);
    expect(JSON.stringify(input)).toBe(snapshot);
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
    expect(card).toBeInstanceOf(HTMLButtonElement);
    expect(card).toHaveAttribute("type", "button");
    card.focus();
    expect(card).toHaveFocus();
    fireEvent.click(card);
    expect(onOpenSymbolDetail).toHaveBeenCalledOnce();
    expect(onOpenSymbolDetail).toHaveBeenCalledWith(fixtures[0].symbol);
  });

  it("keeps collection operations scoped and rejects external data ownership", () => {
    expect(source).not.toMatch(
      /\banomalies\s*\.\s*(?:filter|sort|toSorted|slice|splice|reverse|shift|unshift|push|pop)\s*\(/,
    );
    expect(source).not.toMatch(
      /Array\.from\(\s*anomalies\s*\)\s*\.\s*(?:filter|sort|toSorted|slice|splice|reverse)\s*\(/,
    );
    expect(source).not.toMatch(/new\s+(?:Set|Map)\s*\(\s*anomalies\s*\)/);

    for (const specifier of staticImportSpecifiers(source)) {
      expect(specifier).not.toMatch(/react-router|@tanstack\/react-query/i);
      expect(specifier).not.toMatch(/(?:^|\/)(?:api|queryKeys)$/i);
      expect(specifier).not.toMatch(
        /selectedSymbol|symbolPopup|symbolPopupResource|symbolMarketResource|shared\/api/i,
      );
    }

    expect(source).not.toMatch(
      /\b(?:useQuery|useMutation|useNavigate|useLocation|useParams|useSymbol(?:Popup|Market)Resource)\s*\(/,
    );
    expect(source).not.toMatch(/\b(?:fetch|setTimeout|setInterval)\s*\(/);
    expect(source).not.toMatch(
      /\b(?:localStorage|sessionStorage|WebSocket|XMLHttpRequest|Date\.now)\b/,
    );
    expect(source).not.toMatch(/\bnew\s+Date\s*\(/);
  });
});
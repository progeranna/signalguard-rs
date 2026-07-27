import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/SymbolDetailPage.tsx"),
  "utf8",
);

describe("symbol detail route resource ownership", () => {
  const dashboardSource = readFileSync(
    path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
    "utf8",
  );

  it("uses the shared view-model contract with the popup success renderer", () => {
    expect(source).toContain("adaptMarketResourceToViewModel");
    expect(dashboardSource).toContain("adaptMarketResourceToViewModel");
    expect(source).toContain("MarketDetailViewModel");
    expect(dashboardSource).toContain("MarketDetailViewModel");
    expect(source).not.toContain("formatDecimalString");
    expect(source).not.toContain("formatAnomalyValue");
    const popupSuccess = dashboardSource.slice(
      dashboardSource.indexOf("function SymbolPopupSuccess"),
      dashboardSource.indexOf("function SymbolDetailMetric"),
    );
    expect(popupSuccess).not.toContain("formatTickerPrice");
    expect(popupSuccess).not.toContain("formatAnomalyValue");
    expect(popupSuccess).toContain("metrics");
    expect(popupSuccess).toContain("anomalies");
    expect(source).toContain("symbol: canonicalRouteSymbol ?? resourceState.resource.symbol");
    expect(dashboardSource).toContain("symbol: identity.symbol");
    expect(source).toContain("marketViewModel.stateAvailable");
    expect(source).toContain("anomaly.observed.route");
    expect(dashboardSource).toContain("anomaly.observed.popup");
  });

  it("uses the shared canonical symbol-market resource hook", () => {
    expect(source).toContain("useSymbolMarketResource");
    expect(source).toContain("const canonicalRouteSymbol = parseSymbolId(routeSymbol)");
  });

  it("keeps dashboard summary usage limited to catalog choices", () => {
    expect(source).toContain("const catalogQuery = useCatalogDashboardSummaryQuery");
    expect(source).not.toContain("recentAnomalies.filter");
    expect(source).toContain("availableSymbols.find");
  });

  it("preserves loading, error, unavailable, and success shells", () => {
    expect(source).toContain('resourceState.status === "loading"');
    expect(source).toContain('resourceState.status === "error"');
    expect(source).toContain('resourceState.status === "unavailable"');
    expect(source).toContain('resourceState.status === "success"');
    expect(source).toContain("<LoadingSkeleton");
    expect(source).toContain("<ErrorPanel");
    expect(source).toContain("<SymbolNotFoundState");
  });

  it("preserves route navigation and selected-symbol storage", () => {
    expect(source).toContain('to={`/symbols/${entry.symbol}`}');
    expect(source).toContain("storeSelectedSymbol(selectedUiMode");
  });
});

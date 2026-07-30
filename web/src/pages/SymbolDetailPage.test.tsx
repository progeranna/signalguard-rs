import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/SymbolDetailPage.tsx"),
  "utf8",
);
const dashboardSource = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);

describe("symbol detail route resource ownership", () => {
  it("uses the shared view-model contract with the popup success renderer", () => {
    expect(source).toContain("adaptMarketResourceToViewModel");
    expect(dashboardSource).toContain("adaptMarketResourceToViewModel");
    expect(dashboardSource).toContain("MarketDetailViewModel");
    expect(source).not.toContain("formatDecimalString");
    expect(source).not.toContain("formatAnomalyValue");
    const popupSuccess = dashboardSource.slice(
      dashboardSource.indexOf("function SymbolPopupSuccess"),
      dashboardSource.indexOf("function DashboardTableModal"),
    );
    expect(popupSuccess).not.toContain("formatTickerPrice");
    expect(popupSuccess).not.toContain("formatAnomalyValue");
    expect(popupSuccess).toContain("<SymbolDetailMetrics");
    expect(popupSuccess).toContain("<SymbolDetailAnomalies");
    expect(source).toContain("symbol: canonicalRouteSymbol ?? resourceState.resource.symbol");
    expect(dashboardSource).toContain("symbol: identity.symbol");
    expect(dashboardSource).toContain("<SymbolDetailAnomalies");
  });

  it("uses the accepted shared route presentation sections", () => {
    expect(source).toContain("import { SymbolDetailHeader }");
    expect(source).toContain("<SymbolDetailHeader");
    expect(source).toContain('variant="route"');
    expect(source).toContain(
      '<SymbolDetailMetrics surface="route-strip" viewModel={marketViewModel} />',
    );
    expect(source).toContain(
      '<SymbolDetailMetrics surface="route-state" viewModel={marketViewModel} />',
    );
    expect(source).toContain("import { SymbolDetailAnomalies }");
    expect(source).toContain("<SymbolDetailAnomalies");
    expect(source).toContain('variant="route"\n              symbol={selectedSymbol}');
    expect(source).toContain("anomalies={marketViewModel.anomalies}");
    expect(source).toContain(
      "symbol: canonicalRouteSymbol ?? resourceState.resource.symbol",
    );
    expect(source).not.toContain("symbol={marketViewModel.identity.symbol}");
  });

  it("removes the duplicated inline route presentation ownership", () => {
    for (const removedImplementation of [
      "function MetricStrip(",
      "function MetricStripItem(",
      "function InlineDataRow(",
      "function AnomalyTableRow(",
      "function AnomalyMobileRow(",
      "function InlineMobileValue(",
      "function toneTextClass(",
      "function formatCount(",
    ]) {
      expect(source).not.toContain(removedImplementation);
    }
    expect(source).not.toContain("onOpenSymbolDetail");
    expect(source).not.toContain("<table");
    expect(source).not.toContain("anomaly.observed.route");
    expect(source).not.toContain("anomaly.threshold.route");
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

  it("leaves the popup container and its presentation ownership for MP20", () => {
    expect(dashboardSource).toContain("function SymbolDetailModal(");
    expect(dashboardSource).toContain("function SymbolPopupSuccess(");
    expect(dashboardSource).toContain("<SymbolDetailAnomalies");
    expect(dashboardSource).toContain('variant="popup"');
    expect(dashboardSource).toContain("onOpenSymbolDetail");
    expect(source).not.toContain("SymbolDetailModal");
  });

  it("does not introduce a route anomaly callback or clickable row", () => {
    expect(source).not.toContain("onOpenSymbolDetail");
    expect(source).not.toContain("<button");
    expect(source).not.toContain("role=\"button\"");
  });

  it("does not default an absent source to Demo and uses exact availability copy", () => {
    expect(source).toContain('source === "live" ? "Live" : source === "demo" ? "Demo" : "Unavailable"');
    expect(source).toContain("Configured for Live; Live ingestion is not active.");
    expect(source).toContain("Awaiting first Live market data.");
    expect(source).toContain("Live market data is unavailable.");
  });
});

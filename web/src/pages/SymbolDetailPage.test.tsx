import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  path.join(process.cwd(), "src/pages/SymbolDetailPage.tsx"),
  "utf8",
);
const popupSource = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);
const adapterSource = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/marketAdapters.ts"),
  "utf8",
);

describe("symbol detail route resource ownership", () => {
  it("uses the shared canonical symbol-market resource hook", () => {
    expect(routeSource).toContain("useSymbolMarketResource");
    expect(routeSource).toContain("symbol: parsedRouteSymbol");
  });

  it("keeps dashboard summary usage limited to catalog choices", () => {
    expect(routeSource).toContain(
      "const catalogQuery = useCatalogDashboardSummaryQuery",
    );
    expect(routeSource).not.toContain("recentAnomalies.filter");
    expect(routeSource).not.toContain("availableSymbols.find");
  });

  it("preserves loading, error, unavailable, and success shells", () => {
    expect(routeSource).toContain('resourceState.status === "loading"');
    expect(routeSource).toContain('resourceState.status === "error"');
    expect(routeSource).toContain('resourceState.status === "unavailable"');
    expect(routeSource).toContain('resourceState.status === "success"');
    expect(routeSource).toContain("<LoadingSkeleton");
    expect(routeSource).toContain("<ErrorPanel");
    expect(routeSource).toContain("<SymbolNotFoundState");
  });

  it("preserves route navigation and selected-symbol storage", () => {
    expect(routeSource).toContain('to={`/symbols/${entry.symbol}`}');
    expect(routeSource).toContain(
      "storeSelectedSymbol(selectedUiMode, resolvedSymbol)",
    );
  });
});

describe("market detail view-model consumer boundary", () => {
  it("adapts route and popup success resources through one contract", () => {
    expect(routeSource).toContain("adaptMarketDetailResource");
    expect(routeSource).toContain("viewModel.metrics");
    expect(routeSource).toContain("viewModel.anomalies");
    expect(popupSource).toContain("adaptMarketDetailResource");
    expect(popupSource).toContain("viewModel.metrics");
    expect(popupSource).toContain("viewModel.anomalies");
    expect(popupSource).toContain("viewModel={viewModel}");
  });

  it("keeps raw DTO joining and detail formatting inside the adapter", () => {
    for (const source of [routeSource, popupSource]) {
      expect(source).not.toContain("resource.summary.state");
      expect(source).not.toContain("resource.summary.health");
      expect(source).not.toContain("resource.anomalies.map");
    }

    expect(routeSource).not.toContain("formatObservation(");
    expect(routeSource).not.toContain("formatDisplayPercent(");
    expect(popupSource).not.toContain("resourceState.resource.summary");
    expect(popupSource).not.toContain("resourceState.resource.anomalies");

    expect(adapterSource).toContain("resource.summary.state");
    expect(adapterSource).toContain("resource.summary.health");
    expect(adapterSource).toContain("resource.anomalies.map");
    expect(adapterSource).toContain("formatPopupAnomalyValue");
    expect(adapterSource).toContain("toStatusTone");
  });

  it("keeps the adapted identity explicit at both presentation surfaces", () => {
    expect(routeSource).toContain(
      "{ mode: selectedUiMode, symbol: parsedRouteSymbol }",
    );
    expect(popupSource).toContain(
      "{ mode: identity.mode, symbol: identity.symbol }",
    );
    expect(routeSource).toContain("viewModel.identity.symbol");
    expect(popupSource).toContain("viewModel.identity.symbol");
  });
});

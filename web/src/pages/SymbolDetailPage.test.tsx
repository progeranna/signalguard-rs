import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/SymbolDetailPage.tsx"),
  "utf8",
);

describe("symbol detail route resource ownership", () => {
  it("uses the shared canonical symbol-market resource hook", () => {
    expect(source).toContain("useSymbolMarketResource");
    expect(source).toContain("symbol: parseSymbolId(routeSymbol)");
  });

  it("keeps dashboard summary usage limited to catalog choices", () => {
    expect(source).toContain("const catalogQuery = useCatalogDashboardSummaryQuery");
    expect(source).not.toContain("recentAnomalies.filter");
    expect(source).not.toContain("availableSymbols.find");
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

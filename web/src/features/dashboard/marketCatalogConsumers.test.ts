import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(repositoryPath: string): string {
  return readFileSync(path.join(process.cwd(), repositoryPath), "utf8");
}

const apiSource = readSource("src/features/dashboard/api.ts");
const appShellSource = readSource("src/app/AppShell.tsx");
const dashboardSource = readSource("src/pages/DashboardPage.tsx");
const symbolDetailSource = readSource("src/pages/SymbolDetailPage.tsx");
const tickerSource = readSource("src/app/GlobalMarketTicker.tsx");

describe("market catalog consumer wiring", () => {
  it("keeps the upper ticker on the raw dashboard summary hook", () => {
    expect(tickerSource).toContain("useDashboardSummaryQuery");
    expect(tickerSource).not.toContain("useCatalogDashboardSummaryQuery");
  });

  it("routes only mode-aware catalog consumers through the catalog hook", () => {
    for (const source of [appShellSource, dashboardSource, symbolDetailSource]) {
      expect(source).toContain("useCatalogDashboardSummaryQuery");
      expect(source).not.toContain("useDashboardSummaryQuery(selectedUiMode)");
    }
  });

  it("keeps the raw query hook free of catalog transformation", () => {
    const rawHookStart = apiSource.indexOf(
      "export function useDashboardSummaryQuery",
    );
    const catalogHookStart = apiSource.indexOf(
      "export function useCatalogDashboardSummaryQuery",
    );
    const timelineHookStart = apiSource.indexOf(
      "export function useMarketTimelineQuery",
    );

    expect(rawHookStart).toBeGreaterThanOrEqual(0);
    expect(catalogHookStart).toBeGreaterThan(rawHookStart);
    expect(timelineHookStart).toBeGreaterThan(catalogHookStart);

    const rawHook = apiSource.slice(rawHookStart, catalogHookStart);
    const catalogHook = apiSource.slice(catalogHookStart, timelineHookStart);

    expect(rawHook).not.toContain("buildMarketCatalog");
    expect(rawHook).not.toContain("marketCatalogDashboardSymbols");
    expect(catalogHook).toContain("buildMarketCatalog");
    expect(catalogHook).toContain("marketCatalogDashboardSymbols");
  });

  it("does not let catalog-aware pages reapply Demo coverage", () => {
    expect(dashboardSource).not.toContain("buildCoveredDashboardSymbols");
    expect(symbolDetailSource).not.toContain("buildCoveredDashboardSymbols");
  });
});

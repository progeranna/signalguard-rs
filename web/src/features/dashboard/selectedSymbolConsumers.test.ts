import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readSource(repositoryPath: string): string {
  return readFileSync(path.join(process.cwd(), repositoryPath), "utf8");
}

const appShellSource = readSource("src/app/AppShell.tsx");
const dashboardSource = readSource("src/pages/DashboardPage.tsx");
const symbolDetailSource = readSource("src/pages/SymbolDetailPage.tsx");

describe("mode-scoped selected-symbol consumer wiring", () => {
  it("passes the resolved UI mode into every selected-symbol hook", () => {
    expect(appShellSource).toMatch(
      /useSelectedSymbol\(\s*selectedUiMode,\s*availableSymbols/,
    );
    expect(dashboardSource).toMatch(
      /useSelectedSymbol\(\s*selectedUiMode,\s*availableSymbols/,
    );
    expect(appShellSource).not.toContain("useSelectedSymbol(availableSymbols)");
    expect(dashboardSource).not.toContain("useSelectedSymbol(availableSymbols)");
  });

  it("scopes dashboard popup and table writes to the active mode", () => {
    expect(dashboardSource).toContain(
      "storeSelectedSymbol(selectedUiMode, symbol)",
    );
    expect(dashboardSource).not.toMatch(/storeSelectedSymbol\(symbol\)/);
  });

  it("scopes known route and route-link writes to the active mode", () => {
    expect(symbolDetailSource).toContain(
      "storeSelectedSymbol(selectedUiMode, selectedSummary.symbol)",
    );
    expect(symbolDetailSource).toContain(
      "storeSelectedSymbol(selectedUiMode, entry.symbol)",
    );
    expect(symbolDetailSource).toContain(
      "[isKnownSymbol, selectedSummary, selectedUiMode]",
    );
  });

  it("handles an empty current catalog without fabricating a header market", () => {
    expect(appShellSource).toContain('selectedSymbol ?? "No market"');
    expect(dashboardSource).toContain("selectedSignalSymbol: string | null");
  });

  it("does not reintroduce the legacy global storage API in consumers", () => {
    for (const source of [appShellSource, dashboardSource, symbolDetailSource]) {
      expect(source).not.toContain("SELECTED_SYMBOL_STORAGE_KEY");
      expect(source).not.toMatch(/storeSelectedSymbol\([^,()]+\)/);
    }
  });
});

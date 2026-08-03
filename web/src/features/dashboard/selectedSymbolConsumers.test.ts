import { readFileSync } from "node:fs";
import path from "node:path";

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredSelectedSymbol,
  selectedSymbolStorageKey,
  storeSelectedSymbol,
  useSelectedSymbol,
} from "./selectedSymbol";
import type { UiMode } from "./types";

function readSource(repositoryPath: string): string {
  return readFileSync(path.join(process.cwd(), repositoryPath), "utf8");
}

const appShellSource = readSource("src/app/AppShell.tsx");
const dashboardSource = readSource("src/pages/DashboardPage.tsx");

beforeEach(() => {
  window.localStorage.clear();
});

describe("mode-scoped selected-symbol consumers", () => {
  it("switches modes without leaking the inactive selection", () => {
    storeSelectedSymbol("demo", "BTCUSDT");
    storeSelectedSymbol("live", "ETHUSDT");

    const { result, rerender } = renderHook(
      ({ mode, symbols }: { mode: UiMode; symbols: readonly string[] }) =>
        useSelectedSymbol(mode, symbols),
      {
        initialProps: {
          mode: "demo" as UiMode,
          symbols: ["BTCUSDT", "SOLUSDT"] as readonly string[],
        },
      },
    );

    expect(result.current.selectedSymbol).toBe("BTCUSDT");

    rerender({
      mode: "live",
      symbols: ["ETHUSDT", "XRPUSDT"],
    });
    expect(result.current.selectedSymbol).toBe("ETHUSDT");

    act(() => {
      result.current.setSelectedSymbol("XRPUSDT");
    });

    expect(getStoredSelectedSymbol("live")).toBe("XRPUSDT");
    expect(getStoredSelectedSymbol("demo")).toBe("BTCUSDT");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("live"))).toBe(
      "XRPUSDT",
    );
    expect(window.localStorage.getItem(selectedSymbolStorageKey("demo"))).toBe(
      "BTCUSDT",
    );

    rerender({
      mode: "demo",
      symbols: ["BTCUSDT", "SOLUSDT"],
    });
    expect(result.current.selectedSymbol).toBe("BTCUSDT");
  });

  it("updates only consumers subscribed to the changed mode", () => {
    storeSelectedSymbol("demo", "BTCUSDT");
    storeSelectedSymbol("live", "ETHUSDT");

    const demo = renderHook(() =>
      useSelectedSymbol("demo", ["BTCUSDT", "SOLUSDT"]),
    );
    const live = renderHook(() =>
      useSelectedSymbol("live", ["ETHUSDT", "XRPUSDT"]),
    );

    act(() => {
      storeSelectedSymbol("demo", "SOLUSDT");
    });

    expect(demo.result.current.selectedSymbol).toBe("SOLUSDT");
    expect(live.result.current.selectedSymbol).toBe("ETHUSDT");

    act(() => {
      storeSelectedSymbol("live", "XRPUSDT");
    });

    expect(demo.result.current.selectedSymbol).toBe("SOLUSDT");
    expect(live.result.current.selectedSymbol).toBe("XRPUSDT");
  });

  it("returns no selected market for an empty catalog", () => {
    const { result } = renderHook(() => useSelectedSymbol("demo", []));

    expect(result.current.selectedSymbol).toBeNull();
    expect(appShellSource).toMatch(/selectedSymbol\s*\?\?\s*["']No market["']/);
  });

  it("does not reintroduce the legacy one-argument storage API", () => {
    for (const source of [appShellSource, dashboardSource]) {
      expect(source).not.toContain("SELECTED_SYMBOL_STORAGE_KEY");
      expect(source).not.toMatch(/\bstoreSelectedSymbol\s*\(\s*[^,\n()]+\s*\)/);
    }
  });
});

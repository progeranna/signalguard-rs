import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_UI_MODE } from "./types";
import {
  buildModeSearch,
  getStoredUiMode,
  resolveUiMode,
  storeUiMode,
  UI_MODE_STORAGE_KEY,
} from "./uiMode";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("resolveUiMode", () => {
  it("gives a valid URL mode precedence over the stored mode", () => {
    expect(resolveUiMode("?mode=live", "demo")).toBe("live");
  });

  it("uses a valid stored mode when the URL mode is absent", () => {
    expect(resolveUiMode("", "live")).toBe("live");
  });

  it("ignores an invalid URL mode and uses the valid stored mode", () => {
    expect(resolveUiMode("?mode=preview", "demo")).toBe("demo");
  });

  it("uses the default when neither URL nor storage supplies a valid mode", () => {
    expect(resolveUiMode("?mode=preview", null)).toBe(DEFAULT_UI_MODE);
  });

  it("ignores unrelated search parameters", () => {
    expect(resolveUiMode("?symbol=ETHUSDT&severity=warning", "live")).toBe(
      "live",
    );
  });
});

describe("buildModeSearch", () => {
  it("adds a mode to an empty search string with the query prefix", () => {
    expect(buildModeSearch("", "demo")).toBe("?mode=demo");
  });

  it("replaces the existing mode while preserving unrelated parameters", () => {
    const result = buildModeSearch(
      "?mode=demo&symbol=ETHUSDT&severity=warning",
      "live",
    );
    const params = new URLSearchParams(result);

    expect(result.startsWith("?")).toBe(true);
    expect(params.get("mode")).toBe("live");
    expect(params.get("symbol")).toBe("ETHUSDT");
    expect(params.get("severity")).toBe("warning");
    expect([...params.keys()].sort()).toEqual(["mode", "severity", "symbol"]);
  });

  it("returns deterministic output for the same input", () => {
    const input = "?symbol=BTCUSDT&mode=demo";

    expect(buildModeSearch(input, "live")).toBe(buildModeSearch(input, "live"));
  });
});

describe("stored UI mode", () => {
  it("parses a valid stored value", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "live");

    expect(getStoredUiMode()).toBe("live");
  });

  it("returns null for invalid or absent stored values", () => {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, "preview");
    expect(getStoredUiMode()).toBeNull();

    window.localStorage.removeItem(UI_MODE_STORAGE_KEY);
    expect(getStoredUiMode()).toBeNull();
  });

  it("returns null when localStorage reads fail", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage read blocked");
    });

    expect(() => getStoredUiMode()).not.toThrow();
    expect(getStoredUiMode()).toBeNull();
  });

  it("writes the expected value", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(storeUiMode("demo")).toBe("demo");
    expect(setItem).toHaveBeenCalledWith(UI_MODE_STORAGE_KEY, "demo");
  });

  it("returns safely when localStorage writes fail", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage write blocked");
    });

    expect(() => storeUiMode("live")).not.toThrow();
    expect(storeUiMode("live")).toBe("live");
  });

  it("uses safe non-browser behavior", () => {
    vi.stubGlobal("window", undefined);

    expect(getStoredUiMode()).toBeNull();
    expect(storeUiMode("live")).toBe("live");
  });
});

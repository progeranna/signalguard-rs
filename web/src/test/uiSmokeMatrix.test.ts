// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  UI_SMOKE_DIALOG_REQUIREMENTS,
  UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS,
  UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS,
  UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS,
  UI_SMOKE_MARKETS,
  UI_SMOKE_MODES,
  UI_SMOKE_MODE_SWITCH_SCENARIOS,
  UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS,
  UI_SMOKE_SCENARIOS,
  UI_SMOKE_SCENARIO_GROUPS,
  UI_SMOKE_STATES,
  UI_SMOKE_STEADY_STATE_SCENARIOS,
  UI_SMOKE_SURFACES,
  UI_SMOKE_SYMBOL_SWITCH_SCENARIOS,
  UI_SMOKE_VIEWPORTS,
} from "./uiSmokeMatrix";

function identity(mode: string, market: string, surface: string): string {
  return `${mode}:${market}:${surface}`;
}

describe("UI smoke matrix vocabulary", () => {
  it("defines the exact public modes, markets, surfaces, viewports, and states", () => {
    expect(UI_SMOKE_MODES).toEqual(["demo", "live"]);
    expect(UI_SMOKE_MARKETS).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(UI_SMOKE_SURFACES).toEqual([
      "dashboard",
      "symbol-detail-route",
      "symbol-detail-popup",
    ]);
    expect(UI_SMOKE_VIEWPORTS).toEqual([
      { name: "desktop", width: 1440 },
      { name: "mobile", width: 390 },
    ]);
    expect(UI_SMOKE_STATES).toEqual([
      "loading",
      "error",
      "empty",
      "unavailable",
      "observed-success",
    ]);
  });

  it("imports in a Node environment without browser globals", () => {
    expect("document" in globalThis).toBe(false);
    expect("window" in globalThis).toBe(false);
    expect(UI_SMOKE_SCENARIOS).not.toHaveLength(0);
  });

  it("keeps the manifest independent from UI, cache, storage, and network modules", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/test/uiSmokeMatrix.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']react/);
    expect(source).not.toContain("@tanstack/react-query");
    expect(source).not.toMatch(/\b(document|window|localStorage|fetch|setTimeout)\b/);
  });
});

describe("UI smoke matrix completeness", () => {
  it("covers every mode × market × surface identity with observed success", () => {
    const actual = new Set(
      UI_SMOKE_STEADY_STATE_SCENARIOS
        .filter((scenario) => scenario.state === "observed-success")
        .map((scenario) =>
          identity(scenario.mode, scenario.market, scenario.surface),
        ),
    );
    const expected = new Set(
      UI_SMOKE_MODES.flatMap((mode) =>
        UI_SMOKE_MARKETS.flatMap((market) =>
          UI_SMOKE_SURFACES.map((surface) => identity(mode, market, surface)),
        ),
      ),
    );

    expect(actual).toEqual(expected);
  });

  it("covers every surface at deterministic desktop and mobile widths", () => {
    for (const surface of UI_SMOKE_SURFACES) {
      const viewports = UI_SMOKE_STEADY_STATE_SCENARIOS
        .filter((scenario) => scenario.surface === surface)
        .map((scenario) => `${scenario.viewport}:${scenario.width}`);

      expect(new Set(viewports)).toEqual(
        new Set(["desktop:1440", "mobile:390"]),
      );
    }
  });

  it("contains both mode directions on every public surface", () => {
    for (const surface of UI_SMOKE_SURFACES) {
      const directions = UI_SMOKE_MODE_SWITCH_SCENARIOS
        .filter((scenario) => scenario.surface === surface)
        .map((scenario) => `${scenario.fromMode}->${scenario.toMode}`);

      expect(new Set(directions)).toEqual(
        new Set(["demo->live", "live->demo"]),
      );
    }
  });

  it("contains both market directions for route-to-route and popup-to-popup", () => {
    for (const continuity of ["route-to-route", "popup-to-popup"] as const) {
      const directions = UI_SMOKE_SYMBOL_SWITCH_SCENARIOS
        .filter((scenario) => scenario.continuity === continuity)
        .map((scenario) => `${scenario.fromMarket}->${scenario.toMarket}`);

      expect(new Set(directions)).toEqual(
        new Set(["BTCUSDT->ETHUSDT", "ETHUSDT->BTCUSDT"]),
      );
    }
  });

  it("contains route/popup parity for every mode and market", () => {
    const actual = new Set(
      UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS.map((scenario) =>
        `${scenario.mode}:${scenario.market}`,
      ),
    );
    const expected = new Set(
      UI_SMOKE_MODES.flatMap((mode) =>
        UI_SMOKE_MARKETS.map((market) => `${mode}:${market}`),
      ),
    );

    expect(actual).toEqual(expected);
    expect(
      UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS.every(
        (scenario) =>
          scenario.routeSurface === "symbol-detail-route" &&
          scenario.popupSurface === "symbol-detail-popup",
      ),
    ).toBe(true);
  });

  it("requires late mode and symbol responses to be ignored", () => {
    expect(UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS).not.toHaveLength(0);
    expect(UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS).not.toHaveLength(0);
    expect(
      [
        ...UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS,
        ...UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS,
      ].every((scenario) => scenario.staleResponseMustBeIgnored),
    ).toBe(true);
  });

  it("keeps invalid and missing Live identities explicit without Demo fallback", () => {
    expect(
      new Set(
        UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS.map(
          (scenario) => scenario.identityCase,
        ),
      ),
    ).toEqual(new Set(["invalid", "missing"]));
    expect(
      UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS.every(
        (scenario) =>
          scenario.mode === "live" &&
          scenario.mustRemainExplicit &&
          scenario.permitsDemoFallback === false,
      ),
    ).toBe(true);
  });
});

describe("UI smoke matrix integrity", () => {
  it("represents dialog requirements without claiming incomplete focus work passes", () => {
    expect(
      UI_SMOKE_DIALOG_REQUIREMENTS.map((requirement) => requirement.id),
    ).toEqual([
      "escape-close",
      "backdrop-close",
      "focus-containment",
      "initial-focus",
      "focus-return",
      "body-scroll-lock",
    ]);
    expect(
      UI_SMOKE_DIALOG_REQUIREMENTS
        .filter((requirement) => requirement.currentCoverage === "required")
        .map((requirement) => requirement.id),
    ).toEqual(["focus-containment", "initial-focus", "focus-return"]);
  });

  it("uses stable unique scenario IDs and deterministic group order", () => {
    const ids = UI_SMOKE_SCENARIOS.map((scenario) => scenario.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(UI_SMOKE_SCENARIO_GROUPS)).toEqual([
      "steadyState",
      "modeSwitch",
      "symbolSwitch",
      "routePopupParity",
      "lateModeResponse",
      "lateSymbolResponse",
      "invalidLiveIdentity",
    ]);
    expect(UI_SMOKE_STEADY_STATE_SCENARIOS).toHaveLength(120);
    expect(UI_SMOKE_MODE_SWITCH_SCENARIOS).toHaveLength(24);
    expect(UI_SMOKE_SYMBOL_SWITCH_SCENARIOS).toHaveLength(16);
    expect(UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS).toHaveLength(8);
    expect(UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS).toHaveLength(24);
    expect(UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS).toHaveLength(16);
    expect(UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS).toHaveLength(8);
    expect(UI_SMOKE_SCENARIOS).toHaveLength(216);
    expect(ids[0]).toBe(
      "steady:demo:BTCUSDT:dashboard:desktop:loading",
    );
    expect(ids[ids.length - 1]).toBe(
      "invalid-live-identity:missing:symbol-detail-popup:mobile",
    );
  });

  it("never introduces Replay as a public mode", () => {
    expect(JSON.stringify(UI_SMOKE_SCENARIOS).toLowerCase()).not.toContain(
      "replay",
    );
    expect(UI_SMOKE_MODES).not.toContain("replay");
  });
});

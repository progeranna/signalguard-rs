// @vitest-environment node

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  UI_SMOKE_DIALOG_REQUIREMENTS,
  UI_SMOKE_MARKETS,
  UI_SMOKE_MODES,
  UI_SMOKE_MODE_SWITCH_SCENARIOS,
  UI_SMOKE_SCENARIOS,
  UI_SMOKE_SCENARIO_GROUPS,
  UI_SMOKE_STATES,
  UI_SMOKE_STEADY_STATE_SCENARIOS,
  UI_SMOKE_SURFACES,
  UI_SMOKE_SYMBOL_SWITCH_SCENARIOS,
  UI_SMOKE_VIEWPORTS,
} from "./uiSmokeMatrix";

describe("modal-only UI smoke matrix", () => {
  it("defines only the supported Dashboard and modal surfaces", () => {
    expect(UI_SMOKE_MODES).toEqual(["demo", "live"]);
    expect(UI_SMOKE_MARKETS).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(UI_SMOKE_SURFACES).toEqual([
      "dashboard",
      "symbol-detail-modal",
      "all-anomalies-modal",
      "anomaly-detail-modal",
    ]);
    expect(UI_SMOKE_VIEWPORTS).toEqual([
      { name: "desktop", width: 1440 },
      { name: "mobile", width: 390 },
    ]);
    expect(UI_SMOKE_STATES).toContain("observed-success");
  });

  it("covers every mode, market, surface, viewport, and steady state", () => {
    expect(UI_SMOKE_STEADY_STATE_SCENARIOS).toHaveLength(160);
    for (const mode of UI_SMOKE_MODES) {
      for (const market of UI_SMOKE_MARKETS) {
        for (const surface of UI_SMOKE_SURFACES) {
          for (const viewport of UI_SMOKE_VIEWPORTS) {
            const states = UI_SMOKE_STEADY_STATE_SCENARIOS
              .filter(
                (scenario) =>
                  scenario.mode === mode &&
                  scenario.market === market &&
                  scenario.surface === surface &&
                  scenario.viewport === viewport.name,
              )
              .map((scenario) => scenario.state);
            expect(states).toEqual(UI_SMOKE_STATES);
          }
        }
      }
    }
  });

  it("covers both mode directions and requires stale anomaly detail to close", () => {
    expect(UI_SMOKE_MODE_SWITCH_SCENARIOS).toHaveLength(32);
    expect(
      new Set(
        UI_SMOKE_MODE_SWITCH_SCENARIOS.map(
          (scenario) => `${scenario.obsoleteMode}->${scenario.activeMode}`,
        ),
      ),
    ).toEqual(new Set(["demo->live", "live->demo"]));
    expect(
      UI_SMOKE_MODE_SWITCH_SCENARIOS.every(
        (scenario) => scenario.staleDetailMustClose,
      ),
    ).toBe(true);
  });

  it("covers BTC/ETH transitions without stale responses", () => {
    expect(UI_SMOKE_SYMBOL_SWITCH_SCENARIOS).toHaveLength(16);
    expect(
      new Set(
        UI_SMOKE_SYMBOL_SWITCH_SCENARIOS.map(
          (scenario) => `${scenario.obsoleteMarket}->${scenario.activeMarket}`,
        ),
      ),
    ).toEqual(new Set(["BTCUSDT->ETHUSDT", "ETHUSDT->BTCUSDT"]));
    expect(
      UI_SMOKE_SYMBOL_SWITCH_SCENARIOS.every(
        (scenario) => scenario.staleResponseMustBeIgnored,
      ),
    ).toBe(true);
  });

  it("requires the complete accessible dialog lifecycle", () => {
    expect(UI_SMOKE_DIALOG_REQUIREMENTS).toEqual([
      "escape-close",
      "backdrop-close",
      "focus-containment",
      "initial-focus",
      "focus-return",
      "body-scroll-lock",
      "all-anomalies-back",
    ]);
  });

  it("has stable unique IDs and deterministic group order", () => {
    const ids = UI_SMOKE_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(UI_SMOKE_SCENARIO_GROUPS)).toEqual([
      "steadyState",
      "modeSwitch",
      "symbolSwitch",
    ]);
    expect(UI_SMOKE_SCENARIOS).toHaveLength(208);
  });

  it("stays environment-independent and excludes obsolete navigation vocabulary", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/test/uiSmokeMatrix.ts"),
      "utf8",
    );
    expect("document" in globalThis).toBe(false);
    expect("window" in globalThis).toBe(false);
    expect(source).not.toMatch(/from ["']react/);
    expect(source).not.toMatch(/\b(document|window|localStorage|fetch|setTimeout)\b/);
    expect(source).not.toContain("replay");
  });
});

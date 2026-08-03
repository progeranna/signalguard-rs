export const UI_SMOKE_MODES = ["demo", "live"] as const;
export const UI_SMOKE_MARKETS = ["BTCUSDT", "ETHUSDT"] as const;
export const UI_SMOKE_SURFACES = [
  "dashboard",
  "symbol-detail-modal",
  "all-anomalies-modal",
  "anomaly-detail-modal",
] as const;
export const UI_SMOKE_VIEWPORTS = [
  { name: "desktop", width: 1440 },
  { name: "mobile", width: 390 },
] as const;
export const UI_SMOKE_STATES = [
  "loading",
  "error",
  "empty",
  "unavailable",
  "observed-success",
] as const;

type UiSmokeMode = (typeof UI_SMOKE_MODES)[number];
type UiSmokeMarket = (typeof UI_SMOKE_MARKETS)[number];
type UiSmokeSurface = (typeof UI_SMOKE_SURFACES)[number];
type UiSmokeViewport = (typeof UI_SMOKE_VIEWPORTS)[number]["name"];
type UiSmokeState = (typeof UI_SMOKE_STATES)[number];

type UiSmokeScenarioBase = Readonly<{
  id: string;
  market: UiSmokeMarket;
  surface: UiSmokeSurface;
  viewport: UiSmokeViewport;
  width: number;
}>;

export type UiSmokeSteadyStateScenario = UiSmokeScenarioBase &
  Readonly<{
    group: "steady-state";
    mode: UiSmokeMode;
    state: UiSmokeState;
  }>;

export type UiSmokeModeSwitchScenario = UiSmokeScenarioBase &
  Readonly<{
    activeMode: UiSmokeMode;
    group: "mode-switch";
    obsoleteMode: UiSmokeMode;
    staleDetailMustClose: true;
  }>;

export type UiSmokeSymbolSwitchScenario = UiSmokeScenarioBase &
  Readonly<{
    activeMarket: UiSmokeMarket;
    group: "symbol-switch";
    mode: UiSmokeMode;
    obsoleteMarket: UiSmokeMarket;
    staleResponseMustBeIgnored: true;
  }>;

export const UI_SMOKE_DIALOG_REQUIREMENTS = [
  "escape-close",
  "backdrop-close",
  "focus-containment",
  "initial-focus",
  "focus-return",
  "body-scroll-lock",
  "all-anomalies-back",
] as const;

function scenarioId(...parts: readonly string[]): string {
  return parts.join(":");
}

export const UI_SMOKE_STEADY_STATE_SCENARIOS:
  readonly UiSmokeSteadyStateScenario[] = UI_SMOKE_MODES.flatMap((mode) =>
    UI_SMOKE_MARKETS.flatMap((market) =>
      UI_SMOKE_SURFACES.flatMap((surface) =>
        UI_SMOKE_VIEWPORTS.flatMap(({ name: viewport, width }) =>
          UI_SMOKE_STATES.map((state) => ({
            group: "steady-state" as const,
            id: scenarioId("steady", mode, market, surface, viewport, state),
            market,
            mode,
            state,
            surface,
            viewport,
            width,
          })),
        ),
      ),
    ),
  );

const MODE_SWITCHES = [
  ["demo", "live"],
  ["live", "demo"],
] as const;

export const UI_SMOKE_MODE_SWITCH_SCENARIOS:
  readonly UiSmokeModeSwitchScenario[] = MODE_SWITCHES.flatMap(
    ([obsoleteMode, activeMode]) =>
      UI_SMOKE_MARKETS.flatMap((market) =>
        UI_SMOKE_SURFACES.flatMap((surface) =>
          UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
            activeMode,
            group: "mode-switch" as const,
            id: scenarioId(
              "mode-switch",
              obsoleteMode,
              activeMode,
              market,
              surface,
              viewport,
            ),
            market,
            obsoleteMode,
            staleDetailMustClose: true as const,
            surface,
            viewport,
            width,
          })),
        ),
      ),
  );

const MARKET_SWITCHES = [
  ["BTCUSDT", "ETHUSDT"],
  ["ETHUSDT", "BTCUSDT"],
] as const;
const SYMBOL_SWITCH_SURFACES = ["dashboard", "symbol-detail-modal"] as const;

export const UI_SMOKE_SYMBOL_SWITCH_SCENARIOS:
  readonly UiSmokeSymbolSwitchScenario[] = UI_SMOKE_MODES.flatMap((mode) =>
    MARKET_SWITCHES.flatMap(([obsoleteMarket, activeMarket]) =>
      SYMBOL_SWITCH_SURFACES.flatMap((surface) =>
        UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
          activeMarket,
          group: "symbol-switch" as const,
          id: scenarioId(
            "symbol-switch",
            mode,
            obsoleteMarket,
            activeMarket,
            surface,
            viewport,
          ),
          market: activeMarket,
          mode,
          obsoleteMarket,
          staleResponseMustBeIgnored: true as const,
          surface,
          viewport,
          width,
        })),
      ),
    ),
  );

export const UI_SMOKE_SCENARIO_GROUPS = {
  steadyState: UI_SMOKE_STEADY_STATE_SCENARIOS,
  modeSwitch: UI_SMOKE_MODE_SWITCH_SCENARIOS,
  symbolSwitch: UI_SMOKE_SYMBOL_SWITCH_SCENARIOS,
} as const;

export const UI_SMOKE_SCENARIOS = [
  ...UI_SMOKE_STEADY_STATE_SCENARIOS,
  ...UI_SMOKE_MODE_SWITCH_SCENARIOS,
  ...UI_SMOKE_SYMBOL_SWITCH_SCENARIOS,
] as const;

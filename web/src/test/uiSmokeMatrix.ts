export const UI_SMOKE_MODES = ["demo", "live"] as const;
export type UiSmokeMode = (typeof UI_SMOKE_MODES)[number];

export const UI_SMOKE_MARKETS = ["BTCUSDT", "ETHUSDT"] as const;
export type UiSmokeMarket = (typeof UI_SMOKE_MARKETS)[number];

export const UI_SMOKE_SURFACES = [
  "dashboard",
  "symbol-detail-route",
  "symbol-detail-popup",
] as const;
export type UiSmokeSurface = (typeof UI_SMOKE_SURFACES)[number];

export const UI_SMOKE_VIEWPORTS = [
  { name: "desktop", width: 1440 },
  { name: "mobile", width: 390 },
] as const;
export type UiSmokeViewport = (typeof UI_SMOKE_VIEWPORTS)[number];
export type UiSmokeViewportName = UiSmokeViewport["name"];

export const UI_SMOKE_STATES = [
  "loading",
  "error",
  "empty",
  "unavailable",
  "observed-success",
] as const;
export type UiSmokeState = (typeof UI_SMOKE_STATES)[number];

export const UI_SMOKE_DIALOG_REQUIREMENTS = [
  {
    id: "escape-close",
    currentCoverage: "covered",
    wave: 5,
  },
  {
    id: "backdrop-close",
    currentCoverage: "covered",
    wave: 5,
  },
  {
    id: "focus-containment",
    currentCoverage: "required",
    wave: 5,
  },
  {
    id: "initial-focus",
    currentCoverage: "required",
    wave: 5,
  },
  {
    id: "focus-return",
    currentCoverage: "required",
    wave: 5,
  },
  {
    id: "body-scroll-lock",
    currentCoverage: "covered",
    wave: 5,
  },
] as const;
export type UiSmokeDialogRequirement =
  (typeof UI_SMOKE_DIALOG_REQUIREMENTS)[number];

export type UiSmokeScenarioGroup =
  | "steady-state"
  | "mode-switch"
  | "symbol-switch"
  | "route-popup-parity"
  | "late-mode-response"
  | "late-symbol-response"
  | "invalid-live-identity";

interface UiSmokeScenarioBase {
  readonly group: UiSmokeScenarioGroup;
  readonly id: string;
  readonly surface: UiSmokeSurface;
  readonly viewport: UiSmokeViewportName;
  readonly width: number;
}

export interface UiSmokeSteadyStateScenario extends UiSmokeScenarioBase {
  readonly group: "steady-state";
  readonly market: UiSmokeMarket;
  readonly mode: UiSmokeMode;
  readonly state: UiSmokeState;
}

export interface UiSmokeModeSwitchScenario extends UiSmokeScenarioBase {
  readonly fromMode: UiSmokeMode;
  readonly group: "mode-switch";
  readonly market: UiSmokeMarket;
  readonly toMode: UiSmokeMode;
}

export type UiSmokeNavigationContinuity =
  | "route-to-route"
  | "popup-to-popup";

export interface UiSmokeSymbolSwitchScenario extends UiSmokeScenarioBase {
  readonly continuity: UiSmokeNavigationContinuity;
  readonly fromMarket: UiSmokeMarket;
  readonly group: "symbol-switch";
  readonly mode: UiSmokeMode;
  readonly surface: "symbol-detail-route" | "symbol-detail-popup";
  readonly toMarket: UiSmokeMarket;
}

export interface UiSmokeRoutePopupParityScenario
  extends Omit<UiSmokeScenarioBase, "surface"> {
  readonly group: "route-popup-parity";
  readonly market: UiSmokeMarket;
  readonly mode: UiSmokeMode;
  readonly popupSurface: "symbol-detail-popup";
  readonly routeSurface: "symbol-detail-route";
}

export interface UiSmokeLateModeResponseScenario
  extends UiSmokeScenarioBase {
  readonly activeMode: UiSmokeMode;
  readonly group: "late-mode-response";
  readonly market: UiSmokeMarket;
  readonly obsoleteMode: UiSmokeMode;
  readonly staleResponseMustBeIgnored: true;
}

export interface UiSmokeLateSymbolResponseScenario
  extends UiSmokeScenarioBase {
  readonly activeMarket: UiSmokeMarket;
  readonly group: "late-symbol-response";
  readonly mode: UiSmokeMode;
  readonly obsoleteMarket: UiSmokeMarket;
  readonly staleResponseMustBeIgnored: true;
  readonly surface: "symbol-detail-route" | "symbol-detail-popup";
}

export interface UiSmokeInvalidLiveIdentityScenario
  extends UiSmokeScenarioBase {
  readonly group: "invalid-live-identity";
  readonly identityCase: "invalid" | "missing";
  readonly mode: "live";
  readonly mustRemainExplicit: true;
  readonly permitsDemoFallback: false;
  readonly surface: "symbol-detail-route" | "symbol-detail-popup";
}

export type UiSmokeScenario =
  | UiSmokeSteadyStateScenario
  | UiSmokeModeSwitchScenario
  | UiSmokeSymbolSwitchScenario
  | UiSmokeRoutePopupParityScenario
  | UiSmokeLateModeResponseScenario
  | UiSmokeLateSymbolResponseScenario
  | UiSmokeInvalidLiveIdentityScenario;

const MODE_SWITCHES = [
  ["demo", "live"],
  ["live", "demo"],
] as const satisfies readonly (readonly [UiSmokeMode, UiSmokeMode])[];

const MARKET_SWITCHES = [
  ["BTCUSDT", "ETHUSDT"],
  ["ETHUSDT", "BTCUSDT"],
] as const satisfies readonly (readonly [UiSmokeMarket, UiSmokeMarket])[];

const SYMBOL_SWITCH_SURFACES = [
  {
    continuity: "route-to-route",
    surface: "symbol-detail-route",
  },
  {
    continuity: "popup-to-popup",
    surface: "symbol-detail-popup",
  },
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
            id: scenarioId(
              "steady",
              mode,
              market,
              surface,
              viewport,
              state,
            ),
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

export const UI_SMOKE_MODE_SWITCH_SCENARIOS:
  readonly UiSmokeModeSwitchScenario[] = MODE_SWITCHES.flatMap(
    ([fromMode, toMode]) =>
      UI_SMOKE_MARKETS.flatMap((market) =>
        UI_SMOKE_SURFACES.flatMap((surface) =>
          UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
            fromMode,
            group: "mode-switch" as const,
            id: scenarioId(
              "mode-switch",
              fromMode,
              toMode,
              market,
              surface,
              viewport,
            ),
            market,
            surface,
            toMode,
            viewport,
            width,
          })),
        ),
      ),
  );

export const UI_SMOKE_SYMBOL_SWITCH_SCENARIOS:
  readonly UiSmokeSymbolSwitchScenario[] = UI_SMOKE_MODES.flatMap((mode) =>
    MARKET_SWITCHES.flatMap(([fromMarket, toMarket]) =>
      SYMBOL_SWITCH_SURFACES.flatMap(({ continuity, surface }) =>
        UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
          continuity,
          fromMarket,
          group: "symbol-switch" as const,
          id: scenarioId(
            "symbol-switch",
            mode,
            fromMarket,
            toMarket,
            continuity,
            viewport,
          ),
          mode,
          surface,
          toMarket,
          viewport,
          width,
        })),
      ),
    ),
  );

export const UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS:
  readonly UiSmokeRoutePopupParityScenario[] = UI_SMOKE_MODES.flatMap((mode) =>
    UI_SMOKE_MARKETS.flatMap((market) =>
      UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
        group: "route-popup-parity" as const,
        id: scenarioId("route-popup-parity", mode, market, viewport),
        market,
        mode,
        popupSurface: "symbol-detail-popup" as const,
        routeSurface: "symbol-detail-route" as const,
        viewport,
        width,
      })),
    ),
  );

export const UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS:
  readonly UiSmokeLateModeResponseScenario[] = MODE_SWITCHES.flatMap(
    ([obsoleteMode, activeMode]) =>
      UI_SMOKE_MARKETS.flatMap((market) =>
        UI_SMOKE_SURFACES.flatMap((surface) =>
          UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
            activeMode,
            group: "late-mode-response" as const,
            id: scenarioId(
              "late-mode-response",
              obsoleteMode,
              activeMode,
              market,
              surface,
              viewport,
            ),
            market,
            obsoleteMode,
            staleResponseMustBeIgnored: true as const,
            surface,
            viewport,
            width,
          })),
        ),
      ),
  );

export const UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS:
  readonly UiSmokeLateSymbolResponseScenario[] = UI_SMOKE_MODES.flatMap(
    (mode) =>
      MARKET_SWITCHES.flatMap(([obsoleteMarket, activeMarket]) =>
        SYMBOL_SWITCH_SURFACES.flatMap(({ surface }) =>
          UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
            activeMarket,
            group: "late-symbol-response" as const,
            id: scenarioId(
              "late-symbol-response",
              mode,
              obsoleteMarket,
              activeMarket,
              surface,
              viewport,
            ),
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

export const UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS:
  readonly UiSmokeInvalidLiveIdentityScenario[] = (
    ["invalid", "missing"] as const
  ).flatMap((identityCase) =>
    SYMBOL_SWITCH_SURFACES.flatMap(({ surface }) =>
      UI_SMOKE_VIEWPORTS.map(({ name: viewport, width }) => ({
        group: "invalid-live-identity" as const,
        id: scenarioId(
          "invalid-live-identity",
          identityCase,
          surface,
          viewport,
        ),
        identityCase,
        mode: "live" as const,
        mustRemainExplicit: true as const,
        permitsDemoFallback: false as const,
        surface,
        viewport,
        width,
      })),
    ),
  );

export const UI_SMOKE_SCENARIO_GROUPS = {
  steadyState: UI_SMOKE_STEADY_STATE_SCENARIOS,
  modeSwitch: UI_SMOKE_MODE_SWITCH_SCENARIOS,
  symbolSwitch: UI_SMOKE_SYMBOL_SWITCH_SCENARIOS,
  routePopupParity: UI_SMOKE_ROUTE_POPUP_PARITY_SCENARIOS,
  lateModeResponse: UI_SMOKE_LATE_MODE_RESPONSE_SCENARIOS,
  lateSymbolResponse: UI_SMOKE_LATE_SYMBOL_RESPONSE_SCENARIOS,
  invalidLiveIdentity: UI_SMOKE_INVALID_LIVE_IDENTITY_SCENARIOS,
} as const;

export const UI_SMOKE_SCENARIOS: readonly UiSmokeScenario[] = [
  ...UI_SMOKE_SCENARIO_GROUPS.steadyState,
  ...UI_SMOKE_SCENARIO_GROUPS.modeSwitch,
  ...UI_SMOKE_SCENARIO_GROUPS.symbolSwitch,
  ...UI_SMOKE_SCENARIO_GROUPS.routePopupParity,
  ...UI_SMOKE_SCENARIO_GROUPS.lateModeResponse,
  ...UI_SMOKE_SCENARIO_GROUPS.lateSymbolResponse,
  ...UI_SMOKE_SCENARIO_GROUPS.invalidLiveIdentity,
];

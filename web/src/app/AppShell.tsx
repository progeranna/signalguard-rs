import type { PropsWithChildren, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { GlobalMarketTicker } from "@/app/GlobalMarketTicker";
import {
  dashboardSummaryQueryKey,
  fetchDashboardSummary,
  fetchMarketTimeline,
  fetchRuntimeMode,
  marketTimelineQueryKey,
  marketTimelineQueryKeyRoot,
  runtimeModeQueryKey,
  useDashboardSummaryQuery,
  useRuntimeModeQuery,
  useSwitchRuntimeModeMutation,
} from "@/features/dashboard/api";
import {
  DEMO_MARKETS,
  orderMarkets,
} from "@/features/dashboard/marketOrder";
import { normalizeSelectedSymbol, useSelectedSymbol } from "@/features/dashboard/selectedSymbol";
import type {
  DashboardSummary,
  RuntimeMode,
  RuntimeModeResponse,
} from "@/features/dashboard/types";
import { isApiError, isApiValidationError } from "@/shared/api/errors";
import { statusToneMap, toStatusTone, type StatusTone } from "@/shared/lib/status";

type HeaderMenu = "mode" | "symbol" | null;
type RuntimeSwitchState = {
  startedAt: number;
  targetMode: RuntimeMode;
};

const headerControlClassName =
  "flex min-w-[11rem] items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08131d] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

const RUNTIME_SWITCH_TIMEOUT_MS = 7_000;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const symbolMenuRef = useRef<HTMLDivElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<HeaderMenu>(null);
  const [runtimeSwitchState, setRuntimeSwitchState] = useState<RuntimeSwitchState | null>(
    null,
  );
  const [runtimeSwitchError, setRuntimeSwitchError] = useState<unknown>(null);
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const runtimeModeQuery = useRuntimeModeQuery();
  const switchRuntimeModeMutation = useSwitchRuntimeModeMutation();
  const summary = dashboardSummaryQuery.data ?? null;
  const runtimeMode = runtimeModeQuery.data ?? null;
  const availableSymbols = orderMarkets(
    Array.from(
      new Set([
        ...DEMO_MARKETS,
        ...(runtimeMode?.symbols ?? []),
        ...(summary?.symbols.map((symbol) => symbol.symbol) ?? []),
      ]),
    ),
  );
  const routeSymbolCandidate = location.pathname.startsWith("/symbols/")
    ? location.pathname.slice("/symbols/".length)
    : null;
  const normalizedRouteSymbolCandidate = normalizeSelectedSymbol(routeSymbolCandidate);
  const { selectedSymbol, setSelectedSymbol } = useSelectedSymbol(availableSymbols);
  const isKnownRouteSymbol =
    normalizedRouteSymbolCandidate !== null &&
    availableSymbols.some(
      (symbol) => normalizeSelectedSymbol(symbol) === normalizedRouteSymbolCandidate,
    );
  const displayedHeaderSymbol =
    routeSymbolCandidate && !isKnownRouteSymbol ? "Unknown market" : selectedSymbol;
  const headerStatus = buildHeaderDataStatus(summary, {
    isError: dashboardSummaryQuery.isError,
    isLoading: dashboardSummaryQuery.isLoading,
  });
  const isRuntimeSwitchRefreshing = runtimeSwitchState !== null;
  const showRuntimeSwitchOverlay =
    isRuntimeSwitchRefreshing ||
    switchRuntimeModeMutation.status === "pending" ||
    runtimeMode?.status === "switching";

  async function handleModeSelect(nextMode: RuntimeMode) {
    const request = buildModeSwitchRequest(nextMode);
    const nextSwitchState = {
      startedAt: Date.now(),
      targetMode: nextMode,
    } satisfies RuntimeSwitchState;

    setRuntimeSwitchError(null);
    setRuntimeSwitchState(nextSwitchState);

    try {
      const runtimeMode = await switchRuntimeModeMutation.mutateAsync(request);
      queryClient.setQueryData(runtimeModeQueryKey, runtimeMode);
      let refreshSymbol = selectedSymbol;

      if (
        runtimeMode.symbols.length > 0 &&
        !runtimeMode.symbols.some(
          (symbol) => normalizeSelectedSymbol(symbol) === normalizeSelectedSymbol(selectedSymbol),
        )
      ) {
        const nextSymbol = runtimeMode.symbols[0];
        refreshSymbol = nextSymbol;
        setSelectedSymbol(nextSymbol);

        if (location.pathname.startsWith("/symbols/")) {
          navigate(`/symbols/${nextSymbol}`);
        }
      }

      setActiveMenu(null);
      await refreshAfterRuntimeSwitch({
        queryClient,
        startedAt: nextSwitchState.startedAt,
        selectedSymbol: refreshSymbol,
        targetMode: runtimeMode.mode,
      });
      setRuntimeSwitchState(null);
    } catch (error) {
      setRuntimeSwitchState(null);
      setRuntimeSwitchError(error);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: runtimeModeQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey }),
        queryClient.invalidateQueries({ queryKey: marketTimelineQueryKeyRoot }),
      ]);
    }
  }

  useEffect(() => {
    setActiveMenu(null);
  }, [location.pathname, selectedSymbol]);

  useEffect(() => {
    if (!activeMenu) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedSymbolMenu = symbolMenuRef.current?.contains(target);
      const clickedModeMenu = modeMenuRef.current?.contains(target);

      if (!clickedSymbolMenu && !clickedModeMenu) {
        setActiveMenu(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeMenu]);

  function handleSymbolSelect(nextSymbol: string) {
    setSelectedSymbol(nextSymbol);
    setActiveMenu(null);

    if (location.pathname.startsWith("/symbols/")) {
      navigate(`/symbols/${nextSymbol}`);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--sg-bg)] text-slate-100">
      <div className="flex min-h-screen w-full flex-col">
        <header className="bg-[#050A11]">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <Link
                to="/"
                className="text-base font-bold tracking-tight text-white transition hover:text-cyan-100 focus-visible:outline-none focus-visible:text-cyan-100 lg:justify-self-start"
              >
                SignalGuard RS
              </Link>

              <div className="flex flex-wrap items-center justify-center gap-2 lg:min-w-0 lg:flex-nowrap lg:justify-self-center">
                <HeaderSymbolSelector
                  availableSymbols={availableSymbols}
                  isDisabled={dashboardSummaryQuery.isLoading || availableSymbols.length === 0}
                  isOpen={activeMenu === "symbol"}
                  onSelect={handleSymbolSelect}
                  onToggle={() =>
                    setActiveMenu((menu) => (menu === "symbol" ? null : "symbol"))
                  }
                  selectedSymbol={displayedHeaderSymbol}
                  selectorRef={symbolMenuRef}
                />
                <HeaderModeSelector
                  isRefreshingSwitch={isRuntimeSwitchRefreshing}
                  isOpen={activeMenu === "mode"}
                  onRefreshRuntimeMode={() => void runtimeModeQuery.refetch()}
                  onSelectMode={(mode) => void handleModeSelect(mode)}
                  onToggle={() =>
                    setActiveMenu((menu) => (menu === "mode" ? null : "mode"))
                  }
                  runtimeMode={runtimeMode}
                  runtimeModeError={runtimeModeQuery.error}
                  runtimeModeStatus={{
                    isError: runtimeModeQuery.isError,
                    isLoading: runtimeModeQuery.isLoading,
                  }}
                  selectorRef={modeMenuRef}
                  switchError={runtimeSwitchError ?? switchRuntimeModeMutation.error}
                  switchStatus={switchRuntimeModeMutation.status}
                />
              </div>

              <div className="flex justify-start lg:justify-end">
                <HeaderDataStatus status={headerStatus} />
              </div>
            </div>
          </div>
        </header>
        <div className="relative flex flex-1 flex-col">
          <GlobalMarketTicker />
          <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-3 sm:px-6 lg:px-8">
            {children}
          </main>
          {showRuntimeSwitchOverlay ? (
            <RuntimeSwitchOverlay
              runtimeMode={runtimeMode}
              switchStatus={switchRuntimeModeMutation.status}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HeaderSymbolSelector({
  availableSymbols,
  isDisabled,
  isOpen,
  onSelect,
  onToggle,
  selectedSymbol,
  selectorRef,
}: {
  availableSymbols: string[];
  isDisabled: boolean;
  isOpen: boolean;
  onSelect: (symbol: string) => void;
  onToggle: () => void;
  selectedSymbol: string;
  selectorRef: RefObject<HTMLDivElement>;
}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSelectedSymbol = normalizeSelectedSymbol(selectedSymbol);
  const hasKnownSelectedSymbol = availableSymbols.some(
    (symbol) => normalizeSelectedSymbol(symbol) === normalizedSelectedSymbol,
  );
  const trimmedQuery = searchQuery.trim().toUpperCase();
  const filteredSymbols = trimmedQuery
    ? availableSymbols.filter((symbol) => symbol.toUpperCase().includes(trimmedQuery))
    : availableSymbols;

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  function handleSelect(symbol: string) {
    setSearchQuery("");
    onSelect(symbol);
  }

  return (
    <div ref={selectorRef} className="relative lg:min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isDisabled}
        onClick={onToggle}
        className={[
          headerControlClassName,
          isDisabled ? "cursor-default text-slate-500 hover:border-white/10 hover:bg-[#08131d]" : "",
        ].join(" ")}
      >
        <span className="truncate">{selectedSymbol}</span>
        <span
          aria-hidden="true"
          className={`text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen && availableSymbols.length > 0 ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-white/10 bg-[var(--sg-panel-strong)] shadow-[0_18px_40px_rgba(2,6,23,0.44)]"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search market"
              className="w-full rounded-lg border border-white/10 bg-[#08131d] px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredSymbols.length > 0 ? filteredSymbols.map((symbol) => {
              const isSelected =
                hasKnownSelectedSymbol &&
                normalizeSelectedSymbol(symbol) === normalizedSelectedSymbol;

              return (
                <button
                  key={symbol}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(symbol)}
                  className={[
                    "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm font-semibold transition",
                    isSelected
                      ? "bg-cyan-400/10 text-cyan-100"
                      : "text-slate-200 hover:bg-white/[0.04] hover:text-white",
                  ].join(" ")}
                >
                  <span>{symbol}</span>
                  {isSelected ? (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
                      Current
                    </span>
                  ) : null}
                </button>
              );
            }) : (
              <div className="px-3 py-3 text-sm font-medium text-slate-500">
                No matching markets
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderModeSelector({
  isRefreshingSwitch,
  isOpen,
  onRefreshRuntimeMode,
  onSelectMode,
  onToggle,
  runtimeMode,
  runtimeModeError,
  runtimeModeStatus,
  selectorRef,
  switchError,
  switchStatus,
}: {
  isRefreshingSwitch: boolean;
  isOpen: boolean;
  onRefreshRuntimeMode: () => void;
  onSelectMode: (mode: RuntimeMode) => void;
  onToggle: () => void;
  runtimeMode: RuntimeModeResponse | null;
  runtimeModeError: unknown;
  runtimeModeStatus: { isError: boolean; isLoading: boolean };
  selectorRef: RefObject<HTMLDivElement>;
  switchError: unknown;
  switchStatus: "idle" | "pending" | "success" | "error";
}) {
  const isPending = switchStatus === "pending" || isRefreshingSwitch;
  const currentMode = runtimeMode?.mode ?? null;
  const currentModeLabel = currentMode ? modeOptionLabel(currentMode) : "Runtime mode";
  const currentErrorMessage = buildRuntimeModeMessage(
    switchError ?? runtimeModeError ?? runtimeMode?.last_error ?? null,
    runtimeMode?.last_error ?? null,
  );
  const currentModeTone = runtimeModeTone(runtimeMode?.status, runtimeModeStatus, isPending);
  const runtimeMessage = buildRuntimeModeStatusMessage({
    isPending,
    runtimeMode,
    runtimeModeError,
    runtimeModeStatus,
    switchingSupported: runtimeMode?.switching_supported ?? false,
    switchError,
  });
  const modeOptions: Array<{ mode: RuntimeMode; label: string }> = [
    { mode: "replay", label: "Demo Mode" },
    { mode: "live", label: "Live Mode" },
  ];
  const switchingSupported = runtimeMode?.switching_supported ?? false;
  const disableAllOptions = isPending || runtimeModeStatus.isLoading;
  const disableSwitchActions = disableAllOptions || !switchingSupported;

  return (
    <div ref={selectorRef} className="relative lg:min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={runtimeModeStatus.isLoading && !runtimeMode}
        onClick={onToggle}
        className={[
          headerControlClassName,
          runtimeModeStatus.isLoading && !runtimeMode
            ? "cursor-default text-slate-500 hover:border-white/10 hover:bg-[#08131d]"
            : "",
        ].join(" ")}
        title="Runtime mode is controlled by the backend"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{currentModeLabel}</span>
          <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
            {isPending || runtimeMode?.status === "switching" ? (
              <span className="h-3 w-3 animate-spin rounded-full border border-slate-500 border-t-cyan-300" />
            ) : (
              <span
                aria-hidden="true"
                className={[
                  "h-2 w-2 rounded-full",
                  statusToneMap[currentModeTone].dotClassName,
                ].join(" ")}
              />
            )}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`text-slate-500 transition ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-[var(--sg-panel-strong)] shadow-[0_18px_40px_rgba(2,6,23,0.44)]"
        >
          {runtimeMessage ? (
            <div className="border-b border-white/10 px-3 py-2">
              <p className={`text-sm font-semibold ${runtimeMessage.toneClassName}`}>
                {runtimeMessage.title}
              </p>
              {runtimeMessage.detail ? (
                <p className="mt-1 text-xs leading-5 text-slate-300">{runtimeMessage.detail}</p>
              ) : null}
              {runtimeMessage.retryable ? (
                <button
                  type="button"
                  onClick={onRefreshRuntimeMode}
                  className="mt-2 text-xs font-semibold text-cyan-200 transition hover:text-cyan-100"
                >
                  Retry runtime mode request
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="py-1">
            {modeOptions.map((option) => {
              const isCurrent = option.mode === currentMode;
              const isDisabled = isCurrent ? disableAllOptions : disableSwitchActions;
              const actionLabel =
                !isCurrent && currentErrorMessage ? "Retry" : "Switch";

              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  disabled={isDisabled}
                  onClick={isCurrent ? undefined : () => onSelectMode(option.mode)}
                  className={[
                    "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm font-semibold transition",
                    isCurrent
                      ? "text-cyan-100"
                      : isDisabled
                        ? "cursor-default text-slate-500"
                        : "text-slate-200 hover:bg-white/[0.04] hover:text-white",
                  ].join(" ")}
                >
                  <span>{option.label}</span>
                  <span
                    className={[
                      "text-[11px] font-semibold uppercase tracking-[0.16em]",
                      isCurrent
                        ? "text-cyan-200/90"
                        : isDisabled
                          ? "text-slate-600"
                          : "text-slate-500",
                    ].join(" ")}
                  >
                    {isCurrent ? "Current" : actionLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RuntimeSwitchOverlay({
  runtimeMode,
  switchStatus,
}: {
  runtimeMode: RuntimeModeResponse | null;
  switchStatus: "idle" | "pending" | "success" | "error";
}) {
  const isSwitching = switchStatus === "pending" || runtimeMode?.status === "switching";

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex min-w-[16rem] max-w-sm flex-col items-center rounded-2xl border border-white/10 bg-[#08131d]/95 px-6 py-7 text-center shadow-[0_24px_80px_rgba(2,6,23,0.5)]">
        <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-700 border-t-cyan-300" />
        <p className="mt-4 text-base font-semibold text-white">Refreshing market data...</p>
        <p className="mt-2 text-sm text-slate-300">
          {isSwitching ? "Switching runtime mode" : "Waiting for market snapshot"}
        </p>
      </div>
    </div>
  );
}

async function refreshAfterRuntimeSwitch({
  queryClient,
  startedAt,
  selectedSymbol,
  targetMode,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  startedAt: number;
  selectedSymbol: string | null;
  targetMode: RuntimeMode;
}) {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: runtimeModeQueryKey }),
    queryClient.cancelQueries({ queryKey: dashboardSummaryQueryKey }),
    queryClient.cancelQueries({ queryKey: marketTimelineQueryKeyRoot }),
  ]);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: runtimeModeQueryKey }),
    queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey }),
    queryClient.invalidateQueries({ queryKey: marketTimelineQueryKeyRoot }),
  ]);
  await Promise.all([
    queryClient.refetchQueries({ queryKey: runtimeModeQueryKey, type: "all" }),
    queryClient.refetchQueries({ queryKey: dashboardSummaryQueryKey, type: "all" }),
    queryClient.refetchQueries({ queryKey: marketTimelineQueryKeyRoot, type: "all" }),
  ]);

  const timeoutAt = startedAt + RUNTIME_SWITCH_TIMEOUT_MS;

  while (Date.now() < timeoutAt) {
    const [runtimeMode, summary] = await Promise.all([
      queryClient.fetchQuery({
        queryKey: runtimeModeQueryKey,
        queryFn: fetchRuntimeMode,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        queryKey: dashboardSummaryQueryKey,
        queryFn: fetchDashboardSummary,
        staleTime: 0,
      }),
    ]);
    if (selectedSymbol) {
      await queryClient.fetchQuery({
        queryKey: marketTimelineQueryKey(selectedSymbol),
        queryFn: () => fetchMarketTimeline(selectedSymbol),
        staleTime: 0,
      });
    }

    if (runtimeMode.status === "failed") {
      throw new Error(runtimeMode.last_error ?? "Runtime mode switch failed");
    }

    if (isRuntimeSwitchRefreshReady(targetMode, runtimeMode, summary)) {
      return;
    }

    await delay(600);
  }
}

function buildModeSwitchRequest(mode: RuntimeMode) {
  return {
    mode,
    symbols: [...DEMO_MARKETS],
    reset_state: true,
    reset_storage: true,
  };
}

function modeOptionLabel(mode: RuntimeMode): string {
  return mode === "replay" ? "Demo Mode" : "Live Mode";
}

function runtimeModeTone(
  status: RuntimeModeResponse["status"] | undefined,
  queryState: { isError: boolean; isLoading: boolean },
  isPending: boolean,
): StatusTone {
  if (isPending || status === "switching" || status === "starting") {
    return "warning";
  }

  if (status === "failed" || queryState.isError) {
    return "critical";
  }

  if (status === "running" || status === "completed") {
    return "ok";
  }

  if (status === "stopped") {
    return "neutral";
  }

  if (queryState.isLoading) {
    return "neutral";
  }

  return "neutral";
}

function buildRuntimeModeMessage(
  error: unknown,
  lastError: string | null,
): string | null {
  if (isApiError(error)) {
    return `${error.message} (${error.status})`;
  }

  if (isApiValidationError(error)) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (lastError) {
    return lastError;
  }

  return null;
}

function buildRuntimeModeStatusMessage({
  isPending,
  runtimeMode,
  runtimeModeError,
  runtimeModeStatus,
  switchingSupported,
  switchError,
}: {
  isPending: boolean;
  runtimeMode: RuntimeModeResponse | null;
  runtimeModeError: unknown;
  runtimeModeStatus: { isError: boolean; isLoading: boolean };
  switchingSupported: boolean;
  switchError: unknown;
}): {
  detail?: string;
  retryable?: boolean;
  title: string;
  toneClassName: string;
} | null {
  const errorMessage = buildRuntimeModeMessage(
    switchError ?? runtimeModeError ?? runtimeMode?.last_error ?? null,
    runtimeMode?.last_error ?? null,
  );

  if (isPending || runtimeMode?.status === "switching") {
    return {
      title: "Switching mode...",
      toneClassName: "text-amber-200",
    };
  }

  if (runtimeModeStatus.isError && !runtimeMode) {
    return {
      detail: errorMessage ?? "The runtime mode request did not complete successfully.",
      retryable: true,
      title: "Runtime unavailable",
      toneClassName: "text-rose-300",
    };
  }

  if (runtimeMode?.status === "failed" || switchError || runtimeMode?.last_error) {
    return {
      detail: errorMessage ?? "The runtime mode switch did not complete successfully.",
      title: "Switch failed",
      toneClassName: "text-rose-300",
    };
  }

  if (runtimeModeStatus.isError) {
    return {
      detail: errorMessage ?? "The runtime mode request did not complete successfully.",
      retryable: true,
      title: "Runtime unavailable",
      toneClassName: "text-rose-300",
    };
  }

  if (!switchingSupported && !runtimeModeStatus.isLoading) {
    return {
      title: "Switching unavailable",
      toneClassName: "text-slate-300",
    };
  }

  return null;
}

function isRuntimeSwitchRefreshReady(
  targetMode: RuntimeMode,
  runtimeMode: RuntimeModeResponse,
  summary: DashboardSummary,
): boolean {
  if (runtimeMode.mode !== targetMode) {
    return false;
  }

  if (targetMode === "live") {
    return runtimeMode.status === "running" && summaryHasLiveDemoData(summary);
  }

  return runtimeMode.status === "completed";
}

function summaryHasLiveDemoData(summary: DashboardSummary): boolean {
  const summarySymbols = new Set(
    summary.symbols
      .map((symbol) => normalizeSelectedSymbol(symbol.symbol))
      .filter((symbol): symbol is string => symbol !== null),
  );

  return DEMO_MARKETS.slice(2).some((symbol) =>
    summarySymbols.has(normalizeSelectedSymbol(symbol) ?? symbol),
  );
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });
}

function HeaderDataStatus({ status }: { status: HeaderDataStatusModel }) {
  const tone = status.tone;
  const toneClass = statusToneMap[tone].className;
  const dotClass = statusToneMap[tone].dotClassName;

  return (
    <div className="relative group">
      <div
        tabIndex={0}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold ${toneClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40`}
      >
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span>{status.label}</span>
      </div>
      <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-max max-w-[16rem] rounded-lg border border-white/10 bg-[var(--sg-panel-strong)] px-3 py-2 text-xs leading-5 text-slate-300 opacity-0 shadow-[0_18px_40px_rgba(2,6,23,0.44)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        {status.lastUpdateLabel}
      </div>
    </div>
  );
}

type HeaderDataStatusModel = {
  label: string;
  lastUpdateLabel: string;
  tone: StatusTone;
};

function buildHeaderDataStatus(
  summary: DashboardSummary | null,
  queryState: { isError: boolean; isLoading: boolean },
): HeaderDataStatusModel {
  if (queryState.isLoading) {
    return {
      label: "Checking data",
      lastUpdateLabel: "Last market event: unavailable",
      tone: "neutral",
    };
  }

  if (queryState.isError || !summary) {
    return {
      label: "Status unavailable",
      lastUpdateLabel: "Last market event: unavailable",
      tone: "neutral",
    };
  }

  const symbols = summary.symbols ?? [];
  const pipelineTone = toStatusTone(summary.pipeline.status, "neutral");
  const hasCriticalAnomaly = summary.recent_anomalies.some(
    (anomaly) => anomaly.severity === "critical",
  );
  const hasWarningAnomaly = summary.recent_anomalies.some(
    (anomaly) => anomaly.severity === "warning",
  );
  const hasUnhealthySymbol = symbols.some(
    (symbol) => symbol.health?.status === "unhealthy",
  );
  const hasDegradedSymbol = symbols.some(
    (symbol) => symbol.health?.status === "degraded",
  );
  const tone: StatusTone =
    pipelineTone === "unhealthy" || hasCriticalAnomaly || hasUnhealthySymbol
      ? "critical"
      : pipelineTone === "degraded" || hasWarningAnomaly || hasDegradedSymbol
        ? "degraded"
        : pipelineTone === "healthy"
          ? "healthy"
          : "neutral";
  const lastEventTime = getLatestEventTime(summary);

  return {
    label:
      tone === "healthy"
        ? "Data Healthy"
        : tone === "degraded"
          ? "Data Degraded"
        : tone === "critical"
            ? "Data Critical"
            : "Status Unknown",
    lastUpdateLabel: buildLastMarketEventLabel(lastEventTime),
    tone,
  };
}

function getLatestEventTime(summary: DashboardSummary): string | null {
  const eventTimes = summary.symbols
    .map((symbol) => symbol.state?.last_event_time ?? null)
    .filter((value): value is string => value !== null);

  if (eventTimes.length === 0) {
    return null;
  }

  return eventTimes.reduce((latest, current) => {
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  });
}

function buildLastMarketEventLabel(absoluteTimestamp: string | null): string {
  const absoluteLabel = absoluteTimestamp ? formatHeaderTimestamp(absoluteTimestamp) : null;

  if (absoluteLabel) {
    return `Last market event: ${absoluteLabel}`;
  }

  return "Last market event: unavailable";
}

function formatHeaderTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

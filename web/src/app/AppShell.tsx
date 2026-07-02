import type { PropsWithChildren, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { GlobalMarketTicker } from "@/app/GlobalMarketTicker";
import {
  dashboardSummaryQueryKey,
  runtimeModeQueryKey,
  useDashboardSummaryQuery,
  useRuntimeModeQuery,
  useSwitchRuntimeModeMutation,
} from "@/features/dashboard/api";
import {
  normalizeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import type {
  DashboardSummary,
  RuntimeMode,
  RuntimeModeResponse,
} from "@/features/dashboard/types";
import { isApiError, isApiValidationError } from "@/shared/api/errors";
import { statusToneMap, toStatusTone, type StatusTone } from "@/shared/lib/status";

type HeaderMenu = "mode" | "symbol" | null;

const headerControlClassName =
  "flex min-w-[11rem] items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08131d] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

const PUBLIC_DEMO_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const REPLAY_DEMO_SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const symbolMenuRef = useRef<HTMLDivElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<HeaderMenu>(null);
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const runtimeModeQuery = useRuntimeModeQuery();
  const switchRuntimeModeMutation = useSwitchRuntimeModeMutation();
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = summary?.symbols.map((symbol) => symbol.symbol) ?? [];
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
    routeSymbolCandidate && !isKnownRouteSymbol ? "Unknown symbol" : selectedSymbol;
  const headerStatus = buildHeaderDataStatus(summary, {
    isError: dashboardSummaryQuery.isError,
    isLoading: dashboardSummaryQuery.isLoading,
  });

  async function handleModeSelect(nextMode: RuntimeMode) {
    const request = buildModeSwitchRequest(nextMode);

    try {
      const runtimeMode = await switchRuntimeModeMutation.mutateAsync(request);
      queryClient.setQueryData(runtimeModeQueryKey, runtimeMode);

      if (
        runtimeMode.symbols.length > 0 &&
        !runtimeMode.symbols.some(
          (symbol) => normalizeSelectedSymbol(symbol) === normalizeSelectedSymbol(selectedSymbol),
        )
      ) {
        const nextSymbol = runtimeMode.symbols[0];
        setSelectedSymbol(nextSymbol);

        if (location.pathname.startsWith("/symbols/")) {
          navigate(`/symbols/${nextSymbol}`);
        }
      }

      setActiveMenu(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: runtimeModeQueryKey }),
        queryClient.invalidateQueries({ queryKey: dashboardSummaryQueryKey }),
      ]);
      await queryClient.refetchQueries({
        queryKey: dashboardSummaryQueryKey,
        type: "active",
      });
    } catch {
      await queryClient.invalidateQueries({ queryKey: runtimeModeQueryKey });
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
                  isOpen={activeMenu === "mode"}
                  onRefreshRuntimeMode={() => void runtimeModeQuery.refetch()}
                  onSelectMode={(mode) => void handleModeSelect(mode)}
                  onToggle={() =>
                    setActiveMenu((menu) => (menu === "mode" ? null : "mode"))
                  }
                  runtimeMode={runtimeModeQuery.data ?? null}
                  runtimeModeError={runtimeModeQuery.error}
                  runtimeModeStatus={{
                    isError: runtimeModeQuery.isError,
                    isLoading: runtimeModeQuery.isLoading,
                  }}
                  selectorRef={modeMenuRef}
                  switchError={switchRuntimeModeMutation.error}
                  switchStatus={switchRuntimeModeMutation.status}
                />
              </div>

              <div className="flex justify-start lg:justify-end">
                <HeaderDataStatus status={headerStatus} />
              </div>
            </div>
          </div>
        </header>
        <GlobalMarketTicker />
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-3 sm:px-6 lg:px-8">
          {children}
        </main>
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
              placeholder="Search symbol"
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
                No matching symbols
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderModeSelector({
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
  const isPending = switchStatus === "pending";
  const currentMode = runtimeMode?.mode ?? null;
  const currentModeLabel = runtimeMode?.mode_label ?? "Runtime mode";
  const currentStatusLabel = runtimeModeStatusLabel(runtimeMode, runtimeModeStatus, isPending);
  const currentErrorMessage = buildRuntimeModeMessage(
    switchError ?? runtimeModeError ?? runtimeMode?.last_error ?? null,
    runtimeMode?.last_error ?? null,
  );
  const currentModeTone = runtimeModeTone(runtimeMode?.status, runtimeModeStatus, isPending);
  const modeOptions: Array<{ mode: RuntimeMode; label: string }> = [
    { mode: "replay", label: "Replay Demo" },
    { mode: "live", label: "Public Demo" },
  ];
  const switchingSupported = runtimeMode?.switching_supported ?? false;
  const disableSwitchActions = isPending || runtimeModeStatus.isLoading || !switchingSupported;

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
          <span
            aria-hidden="true"
            className={[
              "h-2 w-2 shrink-0 rounded-full",
              statusToneMap[currentModeTone].dotClassName,
              isPending || runtimeMode?.status === "switching" ? "animate-pulse" : "",
            ].join(" ")}
          />
          <span className="truncate">{currentModeLabel}</span>
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
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Runtime mode
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {currentModeLabel}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Status: {currentStatusLabel}
                </p>
                {runtimeMode ? (
                  <p className="text-xs leading-5 text-slate-500">
                    Source: {runtimeMode.source}
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${statusToneMap[currentModeTone].className}`}
              >
                {currentStatusLabel}
              </span>
            </div>
            {currentErrorMessage ? (
              <p className="mt-2 text-xs leading-5 text-rose-300">{currentErrorMessage}</p>
            ) : null}
            {!switchingSupported && !runtimeModeStatus.isLoading ? (
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Runtime switching is not available from the current backend.
              </p>
            ) : null}
            {runtimeModeStatus.isError && !currentErrorMessage ? (
              <button
                type="button"
                onClick={onRefreshRuntimeMode}
                className="mt-2 text-xs font-semibold text-cyan-200 transition hover:text-cyan-100"
              >
                Retry runtime mode request
              </button>
            ) : null}
          </div>
          <div className="py-1">
            {modeOptions.map((option) => {
              const isCurrent = currentMode === option.mode;
              const isDisabled = disableSwitchActions || isCurrent;

              return (
                <button
                  key={option.mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  disabled={isDisabled}
                  onClick={() => onSelectMode(option.mode)}
                  className={[
                    "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-sm font-semibold transition",
                    isCurrent
                      ? "bg-cyan-400/10 text-cyan-100"
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
                    {isCurrent ? "Current" : isPending ? "Waiting" : "Switch"}
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

function buildModeSwitchRequest(mode: RuntimeMode) {
  if (mode === "live") {
    return {
      mode,
      symbols: [...PUBLIC_DEMO_SYMBOLS],
      reset_state: true,
      reset_storage: true,
    };
  }

  return {
    mode,
    symbols: [...REPLAY_DEMO_SYMBOLS],
    reset_state: true,
    reset_storage: true,
  };
}

function runtimeModeStatusLabel(
  runtimeMode: RuntimeModeResponse | null,
  queryState: { isError: boolean; isLoading: boolean },
  isPending: boolean,
): string {
  if (isPending || runtimeMode?.status === "switching") {
    return "Switching…";
  }

  if (queryState.isLoading && !runtimeMode) {
    return "Loading";
  }

  if (queryState.isError && !runtimeMode) {
    return "Unavailable";
  }

  switch (runtimeMode?.status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "stopped":
      return "Stopped";
    case "starting":
      return "Starting";
    default:
      return "Unknown";
  }
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
      lastUpdateLabel: "Last update: unavailable",
      tone: "neutral",
    };
  }

  if (queryState.isError || !summary) {
    return {
      label: "Status unavailable",
      lastUpdateLabel: "Last update: unavailable",
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
    lastUpdateLabel: buildLastUpdateLabel(lastEventTime),
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

function buildLastUpdateLabel(absoluteTimestamp: string | null): string {
  const absoluteLabel = absoluteTimestamp ? formatHeaderTimestamp(absoluteTimestamp) : null;

  if (absoluteLabel) {
    return `Last update: ${absoluteLabel}`;
  }

  return "Last update: unavailable";
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

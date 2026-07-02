import type { PropsWithChildren, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { GlobalMarketTicker } from "@/app/GlobalMarketTicker";
import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import {
  DEFAULT_SELECTED_SYMBOL,
  normalizeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import type { DashboardSummary } from "@/features/dashboard/types";
import { formatAgeMs } from "@/shared/lib/format";
import { statusToneMap, toStatusTone, type StatusTone } from "@/shared/lib/status";

type HeaderMenu = "mode" | "symbol" | null;

const navigationItems = [
  { label: "Dashboard", to: "/" },
  { label: "Symbol", to: `/symbols/${DEFAULT_SELECTED_SYMBOL}` },
  { label: "Anomalies", to: "/anomalies" },
];

const headerControlClassName =
  "flex min-w-[11rem] items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#08131d] px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const symbolMenuRef = useRef<HTMLDivElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<HeaderMenu>(null);
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;
  const availableSymbols = summary?.symbols.map((symbol) => symbol.symbol) ?? [];
  const routeSymbolCandidate = location.pathname.startsWith("/symbols/")
    ? location.pathname.slice("/symbols/".length)
    : null;
  const { selectedSymbol, setSelectedSymbol } = useSelectedSymbol(
    availableSymbols,
    routeSymbolCandidate,
  );
  const headerStatus = buildHeaderDataStatus(summary, {
    isError: dashboardSummaryQuery.isError,
    isLoading: dashboardSummaryQuery.isLoading,
  });
  const symbolRouteTarget = `/symbols/${selectedSymbol || DEFAULT_SELECTED_SYMBOL}`;

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
              <div className="text-base font-bold tracking-tight text-white lg:justify-self-start">
                SignalGuard RS
              </div>

              <nav className="flex flex-wrap justify-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 lg:justify-self-center">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.label === "Symbol" ? symbolRouteTarget : item.to}
                    className={({ isActive }) => {
                      const matchesSymbolRoute =
                        item.label === "Symbol" &&
                        location.pathname.startsWith("/symbols/");
                      const matchesDashboardRoute =
                        item.label === "Dashboard" &&
                        (location.pathname === "/" || location.pathname === "/dashboard");
                      const navIsActive = matchesSymbolRoute || matchesDashboardRoute || isActive;

                      return [
                        "rounded-full border px-3 py-1.5 transition",
                        navIsActive
                          ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                      ].join(" ");
                    }}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="flex flex-wrap items-center gap-2 lg:min-w-0 lg:flex-nowrap lg:justify-self-end">
                <HeaderSymbolSelector
                  availableSymbols={availableSymbols}
                  isDisabled={dashboardSummaryQuery.isLoading || availableSymbols.length === 0}
                  isOpen={activeMenu === "symbol"}
                  onSelect={handleSymbolSelect}
                  onToggle={() =>
                    setActiveMenu((menu) => (menu === "symbol" ? null : "symbol"))
                  }
                  selectedSymbol={selectedSymbol}
                  selectorRef={symbolMenuRef}
                />
                <HeaderModeSelector
                  isOpen={activeMenu === "mode"}
                  onToggle={() =>
                    setActiveMenu((menu) => (menu === "mode" ? null : "mode"))
                  }
                  selectorRef={modeMenuRef}
                />
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
  const normalizedSelectedSymbol = normalizeSelectedSymbol(selectedSymbol);

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
          <div className="max-h-72 overflow-y-auto py-1">
            {availableSymbols.map((symbol) => {
              const isSelected = normalizeSelectedSymbol(symbol) === normalizedSelectedSymbol;

              return (
                <button
                  key={symbol}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => onSelect(symbol)}
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
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeaderModeSelector({
  isOpen,
  onToggle,
  selectorRef,
}: {
  isOpen: boolean;
  onToggle: () => void;
  selectorRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div ref={selectorRef} className="relative lg:min-w-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={onToggle}
        className={headerControlClassName}
        title="Mode is configured by the running backend"
      >
        <span className="truncate">Replay Demo</span>
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
          <div className="border-b border-white/10 px-3 py-2 text-xs leading-5 text-slate-400">
            Mode is configured by the running backend.
          </div>
          <div className="py-1">
            <div className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm font-semibold text-cyan-100">
              <span>Replay Demo</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
                Current
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-3 py-2.5 text-sm font-semibold text-slate-500">
              <span>Public Demo</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                Unavailable
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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
  const lastEventAge = summary.pipeline.last_message_age_ms;

  return {
    label:
      tone === "healthy"
        ? "Data Healthy"
        : tone === "degraded"
          ? "Data Degraded"
          : tone === "critical"
            ? "Data Critical"
            : "Status Unknown",
    lastUpdateLabel: buildLastUpdateLabel(lastEventTime, lastEventAge),
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

function buildLastUpdateLabel(
  absoluteTimestamp: string | null,
  lastEventAgeMs: number | null,
): string {
  const relativeAge = lastEventAgeMs === null ? null : `${formatAgeMs(lastEventAgeMs)} ago`;
  const absoluteLabel = absoluteTimestamp ? formatHeaderTimestamp(absoluteTimestamp) : null;

  if (absoluteLabel && relativeAge) {
    return `Last update: ${absoluteLabel} · ${relativeAge}`;
  }

  if (absoluteLabel) {
    return `Last update: ${absoluteLabel}`;
  }

  if (relativeAge) {
    return `Last update: ${relativeAge}`;
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

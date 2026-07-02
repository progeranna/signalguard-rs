import type { PropsWithChildren, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { GlobalMarketTicker } from "@/app/GlobalMarketTicker";
import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import {
  normalizeSelectedSymbol,
  useSelectedSymbol,
} from "@/features/dashboard/selectedSymbol";
import { StatusBadge } from "@/shared/components/StatusBadge";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const availableSymbols =
    dashboardSummaryQuery.data?.symbols.map((symbol) => symbol.symbol) ?? [];
  const routeSymbolCandidate = location.pathname.startsWith("/symbols/")
    ? location.pathname.slice("/symbols/".length)
    : null;
  const { selectedSymbol, setSelectedSymbol } = useSelectedSymbol(
    availableSymbols,
    routeSymbolCandidate,
  );
  const [isSymbolMenuOpen, setIsSymbolMenuOpen] = useState(false);
  const navigationItems = [
    { label: "Dashboard", to: "/" },
    { label: "Symbol", to: `/symbols/${selectedSymbol}` },
    { label: "Anomalies", to: "/anomalies" },
  ];

  useEffect(() => {
    setIsSymbolMenuOpen(false);
  }, [location.pathname, selectedSymbol]);

  useEffect(() => {
    if (!isSymbolMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setIsSymbolMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSymbolMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSymbolMenuOpen]);

  function handleSymbolSelect(nextSymbol: string) {
    setSelectedSymbol(nextSymbol);
    setIsSymbolMenuOpen(false);

    if (location.pathname.startsWith("/symbols/")) {
      navigate(`/symbols/${nextSymbol}`);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--sg-bg)] text-slate-100">
      <div className="flex min-h-screen w-full flex-col">
        <header className="bg-[#050A11]">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="text-base font-bold tracking-tight text-white">
              SignalGuard RS
            </div>
            <div className="flex flex-col gap-3 lg:flex-1 lg:flex-row lg:items-center lg:justify-between">
              <nav className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 lg:justify-center">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) => {
                      const matchesSymbolRoute =
                        item.label === "Symbol" &&
                        location.pathname.startsWith("/symbols/");
                      const matchesDashboardRoute =
                        item.label === "Dashboard" &&
                        (location.pathname === "/" || location.pathname === "/dashboard");
                      const navIsActive = matchesSymbolRoute || matchesDashboardRoute || isActive;

                      return (
                        [
                          "rounded-full border px-3 py-1.5 transition",
                          navIsActive
                            ? "border-cyan-400/35 bg-cyan-400/10 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]",
                        ].join(" ")
                      );
                    }}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <HeaderSymbolSelector
                  availableSymbols={availableSymbols}
                  isDisabled={dashboardSummaryQuery.isLoading || availableSymbols.length === 0}
                  isOpen={isSymbolMenuOpen}
                  onSelect={handleSymbolSelect}
                  onToggle={() => setIsSymbolMenuOpen((open) => !open)}
                  selectedSymbol={selectedSymbol}
                  selectorRef={selectorRef}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <StatusBadge status="ok" text="Public Demo" />
              <StatusBadge status="healthy" text="Replay Demo" />
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
    <div ref={selectorRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={isDisabled}
        onClick={onToggle}
        className={[
          "flex min-w-[11rem] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-100 transition",
          isDisabled
            ? "cursor-default border-white/10 bg-[#08131d] text-slate-500"
            : "border-white/10 bg-[#08131d] hover:border-white/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40",
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

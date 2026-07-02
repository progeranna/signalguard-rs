import type { PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { StatusBadge } from "@/shared/components/StatusBadge";

const navigationItems = [
  { label: "Dashboard", to: "/" },
  { label: "Symbol", to: "/symbols/BTCUSDT" },
  { label: "Anomalies", to: "/anomalies" },
];

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--sg-bg)] text-slate-100">
      <div className="flex min-h-screen w-full flex-col">
        <header className="border-b border-white/10 bg-[#050A11]">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="text-base font-bold tracking-tight text-white">
              SignalGuard RS
            </div>
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
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <StatusBadge status="ok" text="Public Demo" />
              <StatusBadge status="healthy" text="Replay Demo" />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-3 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

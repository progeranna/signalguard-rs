import type { PropsWithChildren } from "react";

import { StatusBadge } from "@/shared/components/StatusBadge";

const navigationItems = [
  "Overview",
  "Dashboard",
  "Symbols",
  "Anomalies",
  "Architecture",
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[var(--sg-bg)] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.12),_transparent_28%),linear-gradient(180deg,_rgba(2,6,23,0.3),_rgba(2,6,23,0.85))]" />
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-950/70 px-5 py-5 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-200">
                SG
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.28em] text-slate-400">
                  SignalGuard RS
                </p>
                <h1 className="text-lg font-semibold tracking-tight text-white">
                  Market-data quality console
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Read-only frontend foundation for service health, symbol status,
              and anomaly visibility.
            </p>
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="ok" text="Read only" />
              <StatusBadge status="healthy" text="Observability" />
            </div>
            <nav className="flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              {navigationItems.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/8 bg-white/5 px-3 py-1.5 text-slate-300"
                >
                  {item}
                </span>
              ))}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

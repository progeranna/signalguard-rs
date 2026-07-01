import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import type {
  DashboardAnomaly,
  DashboardSummary,
  DashboardSymbolSummary,
} from "@/features/dashboard/types";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { isApiError, isApiValidationError } from "@/shared/api/errors";
import {
  formatAgeMs,
  formatCompactNumber,
} from "@/shared/lib/format";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

export function DashboardPage() {
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;

  return (
    <section className="space-y-3">
      <DashboardTickerShell summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <DashboardTitleRow />

      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message={buildErrorMessage(dashboardSummaryQuery.error)}
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      <DashboardSummaryGrid summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <MarketSignalShell summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <DashboardTablesGrid summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
    </section>
  );
}

function DashboardTitleRow() {
  return (
    <div className="flex flex-col gap-3 py-1 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white lg:text-3xl">
          Market Data Quality Overview
        </h1>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">
          Real-time monitoring of market-data quality, stream health, and anomaly
          detection.
        </p>
      </div>
      <div className="w-fit rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
        Current summary
      </div>
    </div>
  );
}

function DashboardTickerShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = summary?.symbols ?? [];
  const anomalies = summary?.recent_anomalies ?? [];

  return (
    <section
      aria-label="Market quality ticker"
      className="relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-y border-white/10 bg-[#08131d] py-2"
    >
      {isLoading ? (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <LoadingSkeleton className="h-7" />
        </div>
      ) : symbols.length > 0 ? (
        <div className="overflow-x-auto lg:overflow-hidden">
          <div
            className={`flex w-max min-w-full gap-2 ${
              symbols.length > 1 ? "sg-ticker-track" : ""
            }`.trim()}
          >
            <TickerItemGroup symbols={symbols} anomalies={anomalies} />
            {symbols.length > 1 ? (
              <>
                <div aria-hidden="true" className="flex gap-2">
                  <TickerItemGroup symbols={symbols} anomalies={anomalies} />
                </div>
                <div aria-hidden="true" className="flex gap-2">
                  <TickerItemGroup symbols={symbols} anomalies={anomalies} />
                </div>
                <div aria-hidden="true" className="flex gap-2">
                  <TickerItemGroup symbols={symbols} anomalies={anomalies} />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mx-auto max-w-7xl px-4 text-sm font-medium text-slate-400 sm:px-6 lg:px-8">
          No symbol health data available
        </p>
      )}
    </section>
  );
}

function TickerItemGroup({
  symbols,
  anomalies,
}: {
  symbols: DashboardSymbolSummary[];
  anomalies: DashboardAnomaly[];
}) {
  return (
    <div className="flex gap-2">
      {symbols.slice(0, 8).map((symbol) => (
        <TickerItem
          key={symbol.symbol}
          symbol={symbol}
          anomalies={anomalies.filter((anomaly) => anomaly.symbol === symbol.symbol)}
        />
      ))}
    </div>
  );
}

function TickerItem({
  symbol,
  anomalies,
}: {
  symbol: DashboardSymbolSummary;
  anomalies: DashboardAnomaly[];
}) {
  const status = symbol.health?.status ?? null;
  const statusTone = toStatusTone(status, "neutral");
  const anomalyCount = anomalies.length;
  const hasCriticalAnomaly = anomalies.some((anomaly) => anomaly.severity === "critical");

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-200">
      <span className="font-mono text-[13px] font-bold text-slate-50">
        {symbol.symbol}
      </span>
      <TickerSeparator />
      <span className={`inline-flex items-center gap-2 ${tickerStatusClass(statusTone)}`}>
        <TickerDot status={statusTone} />
        {statusLabel(status)}
      </span>
      <TickerSeparator />
      <span className="text-slate-100">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </span>
      <TickerSeparator />
      <span className={tickerSpreadClass(statusTone)}>
        spread {formatTickerPercent(symbol.state?.spread_pct)}
      </span>
      <TickerSeparator />
      <span className={tickerAnomalyClass(anomalyCount, hasCriticalAnomaly)}>
        {anomalyCount} {anomalyCount === 1 ? "anomaly" : "anomalies"}
      </span>
    </div>
  );
}

function TickerSeparator() {
  return <span className="text-slate-600">·</span>;
}

function TickerDot({ status }: { status: StatusTone }) {
  const className =
    status === "healthy"
      ? "bg-emerald-300"
      : status === "degraded" || status === "warning"
        ? "bg-amber-300"
        : status === "unhealthy" || status === "critical"
          ? "bg-rose-300"
          : "bg-slate-500";

  return <span className={`h-2 w-2 rounded-full ${className}`} />;
}

function tickerStatusClass(status: StatusTone): string {
  switch (status) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
    case "warning":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function tickerSpreadClass(status: StatusTone): string {
  switch (status) {
    case "degraded":
    case "warning":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function tickerAnomalyClass(count: number, hasCriticalAnomaly: boolean): string {
  if (hasCriticalAnomaly || count >= 3) {
    return "text-rose-300";
  }

  if (count > 0) {
    return "text-amber-300";
  }

  return "text-emerald-300";
}

function formatTickerPrice(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value;
}

function formatTickerPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

function symbolHealthBreakdown(symbols: DashboardSymbolSummary[]): string {
  if (symbols.length === 0) {
    return "No symbols";
  }

  const healthyCount = symbols.filter(
    (symbol) => symbol.health?.status === "healthy",
  ).length;
  const attentionCount = symbols.filter(
    (symbol) =>
      symbol.health?.status === "degraded" ||
      symbol.health?.status === "unhealthy",
  ).length;
  const unknownCount = symbols.filter((symbol) => !symbol.health?.status).length;

  if (healthyCount === 0 && attentionCount === 0 && unknownCount > 0) {
    return "Health Unknown";
  }

  if (attentionCount > 0) {
    return `${attentionCount} need attention`;
  }

  return `${healthyCount} healthy`;
}

function DashboardSummaryGrid({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
        <LoadingSkeleton className="h-28" />
      </section>
    );
  }

  const symbols = summary?.symbols ?? [];
  const anomalies = summary?.recent_anomalies ?? [];
  const pipelineStatus = summary?.pipeline.status;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <ServiceHealthCard status={pipelineStatus} />
      <KpiCard
        label="Pipeline Health"
        value={statusLabel(pipelineStatus)}
        description={`Freshness ${formatOptionalAge(
          summary?.pipeline.last_message_age_ms,
        )}`}
        tone={pipelineStatus ? toStatusTone(pipelineStatus) : "neutral"}
        icon="pipeline"
      />
      <KpiCard
        label="Tracked Symbols"
        value={String(symbols.length)}
        description={symbolHealthBreakdown(symbols)}
        tone="info"
        valueTone="neutral"
        icon="symbols"
      />
      <KpiCard
        label="Recent Anomalies"
        value={String(anomalies.length)}
        description="Current summary window"
        tone={anomalies.length > 0 ? "warning" : "healthy"}
        valueTone="neutral"
        icon="anomalies"
      />
    </section>
  );
}

function ServiceHealthCard({ status }: { status: string | null | undefined }) {
  const tone = toStatusTone(status, "neutral");
  const palette = serviceHealthPalette(tone);

  return (
    <article className="sg-panel flex min-h-24 items-center gap-4 overflow-hidden px-4 py-3">
      <KpiIcon tone={tone} kind="service" />

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Service Health
        </p>
        <p className={`mt-2 text-2xl font-extrabold leading-none tracking-tight ${palette.text}`}>
          {statusLabel(status)}
        </p>
        <p className="mt-1 text-sm font-medium leading-5 text-slate-400">
          {serviceStatusMessage(status)}
        </p>
      </div>
    </article>
  );
}

function KpiCard({
  label,
  value,
  description,
  tone = "neutral",
  valueTone,
  icon,
}: {
  label: string;
  value: string;
  description: string;
  tone?: StatusTone;
  valueTone?: StatusTone;
  icon: KpiIconKind;
}) {
  return (
    <article className="sg-panel flex min-h-24 items-center gap-4 overflow-hidden px-4 py-3">
      <KpiIcon tone={tone} kind={icon} />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <p
          className={`mt-2 text-2xl font-extrabold leading-none tracking-tight ${kpiValueClass(
            valueTone ?? tone,
          )}`}
        >
          {value}
        </p>
        <p className="mt-1 truncate text-sm leading-5 text-slate-400">{description}</p>
      </div>
    </article>
  );
}

type KpiIconKind = "service" | "pipeline" | "symbols" | "anomalies";

function KpiIcon({ tone, kind }: { tone: StatusTone; kind: KpiIconKind }) {
  const palette = serviceHealthPalette(tone);

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border shadow-inner ${palette.icon}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 96 96"
        className={`h-7 w-7 ${palette.pulse}`}
        fill="none"
      >
        {kind === "service" ? (
          <>
            <circle cx="48" cy="48" r="30" stroke="currentColor" strokeOpacity="0.18" strokeWidth="6" />
            <path
              d="M18 50h14l8-18 13 38 9-24h16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="6"
            />
          </>
        ) : null}
        {kind === "pipeline" ? (
          <>
            <path
              d="M20 48h20m16 0h20M40 48l8-14 8 14m-16 0 8 14 8-14"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="5"
            />
            <circle cx="20" cy="48" r="7" fill="currentColor" />
            <circle cx="48" cy="34" r="7" fill="currentColor" />
            <circle cx="48" cy="62" r="7" fill="currentColor" />
            <circle cx="76" cy="48" r="7" fill="currentColor" />
          </>
        ) : null}
        {kind === "symbols" ? (
          <>
            <circle cx="48" cy="48" r="26" stroke="currentColor" strokeOpacity="0.22" strokeWidth="5" />
            <circle cx="48" cy="48" r="6" fill="currentColor" />
            <circle cx="48" cy="22" r="5" fill="currentColor" fillOpacity="0.85" />
            <circle cx="70" cy="48" r="5" fill="currentColor" fillOpacity="0.85" />
            <circle cx="48" cy="74" r="5" fill="currentColor" fillOpacity="0.85" />
            <circle cx="26" cy="48" r="5" fill="currentColor" fillOpacity="0.85" />
          </>
        ) : null}
        {kind === "anomalies" ? (
          <>
            <path
              d="M48 20 76 72H20Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="6"
            />
            <path
              d="M48 36v16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="6"
            />
            <circle cx="48" cy="62" r="4" fill="currentColor" />
          </>
        ) : null}
      </svg>
    </div>
  );
}

function kpiValueClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
    case "warning":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    case "info":
      return "text-sky-200";
    default:
      return "text-white";
  }
}

function MarketSignalShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const selectedSymbol = selectSignalSymbol(summary?.symbols ?? []);
  const selectedAnomalies = selectedSymbol
    ? (summary?.recent_anomalies ?? []).filter(
        (anomaly) => anomaly.symbol === selectedSymbol.symbol,
      )
    : [];
  const signalSeries = selectedSymbol
    ? buildSignalSeries(selectedSymbol, selectedAnomalies)
    : [];
  const signalDomain = buildSignalDomain(signalSeries);
  const signalSeverity = highestAnomalySeverity(selectedAnomalies);

  return (
    <section className="overflow-hidden border-y border-white/10 bg-[var(--sg-panel)] px-4 py-2.5 shadow-[0_14px_34px_rgba(2,6,23,0.18)] sm:px-5">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-2.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-400">Market Signal View</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white">
            Summary-backed signal preview
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">
            Latest summary-backed preview, not historical price data.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status="info" text="Latest state" />
          {selectedSymbol ? (
            <StatusBadge
              status={toStatusTone(selectedSymbol.health?.status, "neutral")}
              text={selectedSymbol.health?.status ?? "Unknown"}
            />
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton className="mt-2.5 h-40" />
      ) : !selectedSymbol || signalSeries.length === 0 ? (
        <EmptyBlock message="No monitored symbol state available for the signal preview." />
      ) : (
        <div className="mt-2.5">
          <div className="rounded-xl border border-white/10 bg-[#0b141d] px-3 py-2.5 sm:px-4">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-bold text-white">
                  <span>{selectedSymbol.symbol}</span>
                  {signalSeverity ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${anomalyMarkerBadgeClass(
                        signalSeverity,
                      )}`}
                    >
                      {statusLabel(signalSeverity)} signal
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Latest state with anomaly markers</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_248px]">
              <div className="flex min-h-[190px] rounded-xl border border-slate-700/70 bg-slate-950/70">
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={signalSeries}
                      margin={{ top: 4, right: 14, bottom: 2, left: 0 }}
                    >
                      <defs>
                        <linearGradient id="qualitySignalFill" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="#7EE45B" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#7EE45B" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(100,116,139,0.18)"
                        strokeDasharray="3 8"
                        vertical={false}
                      />
                      <XAxis
                        axisLine={false}
                        dataKey="label"
                        height={18}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        tickLine={false}
                        tickMargin={2}
                      />
                      <YAxis
                        axisLine={false}
                        domain={signalDomain}
                        tick={{ fill: "#64748b", fontSize: 11 }}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0E1822",
                          border: "1px solid rgba(148,163,184,0.18)",
                          borderRadius: "10px",
                          color: "#e2e8f0",
                        }}
                        formatter={(value) => [`${value}`, "Signal"]}
                        labelFormatter={() => "Summary-backed preview"}
                      />
                      {signalSeries
                        .filter((point) => point.severity)
                        .map((point) => (
                          <ReferenceLine
                            key={`marker-${point.label}`}
                            stroke={anomalySeverityColor(point.severity)}
                            strokeDasharray="3 4"
                            strokeOpacity={0.85}
                            x={point.label}
                          />
                        ))}
                      <Area
                        baseValue={signalDomain[0]}
                        dataKey="signal"
                        fill="url(#qualitySignalFill)"
                        isAnimationActive={false}
                        stroke="#7EE45B"
                        strokeWidth={2.4}
                        type="monotone"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <aside className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
                <div className="border-b border-white/10 pb-1.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Signal Snapshot
                  </p>
                  <p className="mt-0.5 text-xs font-medium text-slate-300">
                    Current summary-backed state
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  <SignalSnapshotMetric
                    label="Price"
                    value={formatTickerPrice(selectedSymbol.state?.last_trade_price)}
                  />
                  <SignalSnapshotMetric
                    label="Spread"
                    value={formatTickerPercent(selectedSymbol.state?.spread_pct)}
                  />
                  <SignalSnapshotMetric
                    label="Trades/min"
                    value={formatOptionalCompact(selectedSymbol.state?.trades_per_minute)}
                  />
                  <SignalSnapshotMetric
                    label="Freshness"
                    value={formatOptionalAge(
                      selectedSymbol.state?.last_event_age_ms ??
                        summary?.pipeline.last_message_age_ms,
                    )}
                  />
                </div>
              </aside>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SignalSnapshotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-slate-950/35 px-3 py-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function DashboardTablesGrid({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  return (
    <section className="grid gap-3 xl:grid-cols-2">
      <SymbolHealthShell summary={summary} isLoading={isLoading} />
      <RecentAnomaliesShell summary={summary} isLoading={isLoading} />
    </section>
  );
}

function SymbolHealthShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const symbols = summary?.symbols ?? [];

  return (
    <section className="sg-panel overflow-hidden px-4 py-4">
      <SectionTitle title="Symbol Health" />
      {isLoading ? (
        <LoadingSkeleton className="mt-3 h-44" />
      ) : symbols.length > 0 ? (
        <>
          <div className="mt-3 hidden max-h-72 overflow-y-auto pr-1 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="pb-3 pr-4">Symbol</th>
                  <th className="pb-3 pr-4">Health Score</th>
                  <th className="pb-3 pr-4">Last Price</th>
                  <th className="pb-3 pr-4">Spread</th>
                  <th className="pb-3 pr-4">Trades/min</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {symbols.slice(0, 8).map((symbol) => (
                  <SymbolHealthTableRow key={symbol.symbol} symbol={symbol} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 space-y-3 lg:hidden">
            {symbols.slice(0, 8).map((symbol) => (
              <SymbolHealthCard key={symbol.symbol} symbol={symbol} />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No symbol health data available" />
      )}
    </section>
  );
}

function SymbolHealthTableRow({ symbol }: { symbol: DashboardSymbolSummary }) {
  const score = symbol.health?.score ?? null;
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-2.5 pr-4">
        <Link
          to={`/symbols/${symbol.symbol}`}
          className="font-mono text-base font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {symbol.symbol}
        </Link>
      </td>
      <td className="py-2.5 pr-4">
        <HealthScore score={score} status={symbol.health?.status} />
      </td>
      <td className="py-2.5 pr-4 text-sm font-semibold text-slate-100">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </td>
      <td className="py-2.5 pr-4 text-sm font-semibold text-slate-300">
        {formatTickerPercent(symbol.state?.spread_pct)}
      </td>
      <td className="py-2.5 pr-4 text-sm font-semibold text-slate-300">
        {formatOptionalCompact(symbol.state?.trades_per_minute)}
      </td>
      <td className="py-2.5 text-right">
        <StatusBadge
          status={statusTone}
          text={statusLabel(symbol.health?.status)}
        />
      </td>
    </tr>
  );
}

function SymbolHealthCard({ symbol }: { symbol: DashboardSymbolSummary }) {
  const statusTone = toStatusTone(symbol.health?.status, "neutral");

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <Link
          to={`/symbols/${symbol.symbol}`}
          className="font-mono text-lg font-bold text-white transition hover:text-cyan-200"
        >
          {symbol.symbol}
        </Link>
        <StatusBadge
          status={statusTone}
          text={statusLabel(symbol.health?.status)}
        />
      </div>
      <div className="mt-4">
        <HealthScore
          score={symbol.health?.score ?? null}
          status={symbol.health?.status}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileSymbolMetric
          label="Price"
          value={formatTickerPrice(symbol.state?.last_trade_price)}
        />
        <MobileSymbolMetric
          label="Spread"
          value={formatTickerPercent(symbol.state?.spread_pct)}
        />
        <MobileSymbolMetric
          label="Trades/min"
          value={formatOptionalCompact(symbol.state?.trades_per_minute)}
        />
        <MobileSymbolMetric
          label="Age"
          value={formatOptionalAge(symbol.state?.last_event_age_ms)}
        />
      </div>
    </article>
  );
}

function HealthScore({
  score,
  status,
}: {
  score: number | null;
  status: string | null | undefined;
}) {
  const tone = healthScoreTone(score, status);
  const width = score === null ? 18 : Math.max(score, 4);

  return (
    <div className="min-w-28">
      <div className="flex items-center gap-3">
        <span className={`text-lg font-extrabold ${healthScoreTextClass(tone)}`}>
          {score ?? "Unknown"}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70">
          <div
            className={`h-full rounded-full ${healthScoreBarClass(tone)}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function MobileSymbolMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

function RecentAnomaliesShell({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const anomalies = summary?.recent_anomalies ?? [];

  return (
    <section className="sg-panel overflow-hidden px-4 py-4">
      <SectionTitle title="Recent Anomalies" action={<Link to="/anomalies">View all</Link>} />
      {isLoading ? (
        <LoadingSkeleton className="mt-3 h-44" />
      ) : anomalies.length > 0 ? (
        <>
          <div className="mt-3 hidden max-h-72 overflow-y-auto pr-1 lg:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <th className="pb-3 pr-4">Time</th>
                  <th className="pb-3 pr-4">Symbol</th>
                  <th className="pb-3 pr-4">Type</th>
                  <th className="pb-3 pr-4">Severity</th>
                  <th className="pb-3 pr-4">Observed</th>
                  <th className="pb-3">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.slice(0, 8).map((anomaly) => (
                  <AnomalyTableRow key={anomaly.id} anomaly={anomaly} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 space-y-3 lg:hidden">
            {anomalies.slice(0, 8).map((anomaly) => (
              <AnomalyCard key={anomaly.id} anomaly={anomaly} />
            ))}
          </div>
        </>
      ) : (
        <EmptyBlock message="No recent anomalies. Detector output is clean for the current summary window." />
      )}
    </section>
  );
}

function AnomalyTableRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <tr className="border-b border-white/[0.06] last:border-0">
      <td className="py-2.5 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="py-2.5 pr-4">
        <Link
          to={`/symbols/${anomaly.symbol}`}
          className="font-mono text-sm font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {anomaly.symbol}
        </Link>
      </td>
      <td className="py-2.5 pr-4 text-sm font-bold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="py-2.5 pr-4">
        <SeverityBadge severity={anomaly.severity} />
      </td>
      <td className={`py-2.5 pr-4 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed")}
      </td>
      <td className="py-2.5 text-sm font-semibold text-slate-300">
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.threshold_value, "threshold")}
      </td>
    </tr>
  );
}

function AnomalyCard({ anomaly }: { anomaly: DashboardAnomaly }) {
  const severityTone = toStatusTone(anomaly.severity, "neutral");

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={`/symbols/${anomaly.symbol}`}
            className="font-mono text-base font-bold text-white transition hover:text-cyan-200"
          >
            {anomaly.symbol}
          </Link>
          <p className="mt-2 text-base font-bold text-slate-100">
            {formatAnomalyType(anomaly.anomaly_type)}
          </p>
        </div>
        <SeverityBadge severity={anomaly.severity} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <MobileSymbolMetric
          label="Observed"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.observed_value,
            "observed",
          )}
        />
        <MobileSymbolMetric
          label="Threshold"
          value={formatAnomalyValue(
            anomaly.anomaly_type,
            anomaly.threshold_value,
            "threshold",
          )}
        />
        <MobileSymbolMetric
          label="Time"
          value={formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
        />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Severity
          </p>
          <p className={`mt-1 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
            {statusLabel(anomaly.severity)}
          </p>
        </div>
      </div>
    </article>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
      <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
      {action ? (
        <div className="text-sm font-semibold text-cyan-200 transition hover:text-cyan-100">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function serviceHealthPalette(status: StatusTone): {
  icon: string;
  pulse: string;
  text: string;
} {
  switch (status) {
    case "healthy":
      return {
        icon: "border-emerald-500/35 bg-emerald-400/[0.14]",
        pulse: "text-emerald-300",
        text: "text-emerald-300",
      };
    case "degraded":
    case "warning":
      return {
        icon: "border-amber-400/35 bg-amber-400/[0.12]",
        pulse: "text-amber-300",
        text: "text-amber-300",
      };
    case "unhealthy":
    case "critical":
      return {
        icon: "border-rose-400/35 bg-rose-400/[0.12]",
        pulse: "text-rose-300",
        text: "text-rose-300",
      };
    default:
      return {
        icon: "border-slate-600/70 bg-slate-800/45",
        pulse: "text-slate-400",
        text: "text-slate-300",
      };
  }
}

function selectSignalSymbol(
  symbols: DashboardSymbolSummary[],
): DashboardSymbolSummary | null {
  return symbols.find((symbol) => symbol.symbol === "BTCUSDT") ?? symbols[0] ?? null;
}

type SignalPoint = {
  label: string;
  signal: number;
  severity?: DashboardAnomaly["severity"];
};

function buildSignalSeries(
  symbol: DashboardSymbolSummary,
  anomalies: DashboardAnomaly[],
): SignalPoint[] {
  const score = symbol.health?.score ?? 55;
  const spread = symbol.state?.spread_pct ?? 0;
  const tradeRate = symbol.state?.trades_per_minute ?? 0;
  const agePenalty = Math.min((symbol.state?.last_event_age_ms ?? 0) / 30_000, 8);
  const anomalyPenalty = Math.min(anomalies.length * 3, 12);
  const base = clamp(score - spread * 20 - agePenalty - anomalyPenalty, 18, 94);
  const activity = clamp(tradeRate / 12, 0, 7);
  const statusLift =
    symbol.health?.status === "healthy"
      ? 4
      : symbol.health?.status === "degraded"
        ? -3
        : symbol.health?.status === "unhealthy"
          ? -9
          : 0;

  const anomalySlots = anomalies.slice(0, 5).map((anomaly, index) => ({
    slot: Math.round(((index + 1) * 8) / (Math.min(anomalies.length, 5) + 1)),
    severity: anomaly.severity,
  }));

  return [
    ["S1", clamp(base - 6 + statusLift, 6, 98)],
    ["S2", clamp(base - 1 + activity, 6, 98)],
    ["S3", clamp(base + 4 + statusLift / 2, 6, 98)],
    ["S4", clamp(base + 1 - anomalyPenalty / 2, 6, 98)],
    ["S5", clamp(base + 6 - agePenalty, 6, 98)],
    ["S6", clamp(base + 2 + activity / 2, 6, 98)],
    ["S7", clamp(base + statusLift - anomalyPenalty / 3, 6, 98)],
    ["S8", clamp(base + 5 - spread * 8, 6, 98)],
  ].map(([label, signal], index) => ({
    label: String(label),
    severity: anomalySlots.find((marker) => marker.slot === index + 1)?.severity,
    signal: Number(signal),
  }));
}

function buildSignalDomain(series: SignalPoint[]): [number, number] {
  if (series.length === 0) {
    return [0, 100];
  }

  const values = series.map((point) => point.signal);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const range = Math.max(high - low, 1);
  const targetRange = Math.max(range + 2, 8);
  const midpoint = (low + high) / 2;

  return [
    clamp(Math.floor(midpoint - targetRange / 2), 0, 100),
    clamp(Math.ceil(midpoint + targetRange / 2), 0, 100),
  ];
}

function anomalySeverityColor(severity: DashboardAnomaly["severity"] | undefined): string {
  switch (severity) {
    case "critical":
      return "#FF6B5F";
    case "warning":
      return "#F5C542";
    case "info":
      return "#63A7FF";
    default:
      return "#94A3B8";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function highestAnomalySeverity(
  anomalies: DashboardAnomaly[],
): DashboardAnomaly["severity"] | null {
  if (anomalies.some((anomaly) => anomaly.severity === "critical")) {
    return "critical";
  }

  if (anomalies.some((anomaly) => anomaly.severity === "warning")) {
    return "warning";
  }

  if (anomalies.some((anomaly) => anomaly.severity === "info")) {
    return "info";
  }

  return null;
}

function anomalyMarkerBadgeClass(severity: DashboardAnomaly["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rose-400/35 bg-rose-400/10 text-rose-200";
    case "warning":
      return "border-amber-400/35 bg-amber-400/10 text-amber-200";
    case "info":
      return "border-sky-400/35 bg-sky-400/10 text-sky-200";
    default:
      return "border-slate-500/40 bg-slate-700/30 text-slate-300";
  }
}

function SeverityBadge({ severity }: { severity: DashboardAnomaly["severity"] }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${severityBadgeClass(
        severity,
      )}`}
    >
      {statusLabel(severity)}
    </span>
  );
}

function severityBadgeClass(severity: DashboardAnomaly["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rose-400/35 bg-rose-400/10 text-rose-200";
    case "warning":
      return "border-amber-400/35 bg-amber-400/10 text-amber-200";
    case "info":
      return "border-sky-400/35 bg-sky-400/10 text-sky-200";
    default:
      return "border-slate-500/40 bg-slate-700/30 text-slate-300";
  }
}

function anomalyValueClass(severity: StatusTone): string {
  switch (severity) {
    case "critical":
      return "text-rose-300";
    case "warning":
      return "text-amber-300";
    case "info":
      return "text-sky-200";
    default:
      return "text-slate-300";
  }
}

function formatAnomalyType(type: string | null | undefined): string {
  if (!type) {
    return "Unknown";
  }

  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAnomalyTime(value: string | null | undefined): string {
  if (!value) {
    return "Unavailable";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatAnomalyValue(
  type: string,
  value: number | null | undefined,
  role: "observed" | "threshold",
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  switch (type) {
    case "spread_spike":
    case "price_move":
      return `${value.toFixed(3)}%`;
    case "event_lag_spike":
      return formatDurationValue(value);
    case "stale_data":
    case "quote_stuck":
      return formatDurationValue(value);
    case "trade_burst":
      return `${formatIntegerValue(value)} /m`;
    case "depth_sequence_gap":
      return `${formatIntegerValue(value)} ${role === "threshold" ? "limit" : "gap"}`;
    default:
      return formatNumericValue(value);
  }
}

function formatDurationValue(value: number): string {
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)} s`;
  }

  return `${formatNumericValue(value)} ms`;
}

function formatIntegerValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

function healthScoreTone(
  score: number | null,
  status: string | null | undefined,
): StatusTone {
  if (status === "healthy" || (score !== null && score >= 80)) {
    return "healthy";
  }

  if (status === "degraded" || (score !== null && score >= 50)) {
    return "degraded";
  }

  if (status === "unhealthy" || (score !== null && score < 50)) {
    return "unhealthy";
  }

  return "neutral";
}

function healthScoreTextClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function healthScoreBarClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "bg-emerald-300";
    case "degraded":
      return "bg-amber-300";
    case "unhealthy":
    case "critical":
      return "bg-rose-300";
    default:
      return "bg-slate-500";
  }
}

function formatOptionalAge(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return formatAgeMs(value);
}

function formatOptionalCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return formatCompactNumber(value);
}

function statusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function serviceStatusMessage(value: string | null | undefined): string {
  switch (value) {
    case "healthy":
      return "All systems operational";
    case "degraded":
      return "Some market-data signals need attention";
    case "unhealthy":
      return "Critical data-quality issues detected";
    default:
      return "Dashboard summary unavailable";
  }
}

function buildErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.message} (${error.status})`;
  }

  if (isApiValidationError(error)) {
    return error.message;
  }

  return "The dashboard summary request did not complete successfully.";
}

import { Link } from "react-router-dom";

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
    <section className="space-y-3 lg:space-y-4">
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
      />
      <KpiCard
        label="Tracked Symbols"
        value={String(symbols.length)}
        description={symbolHealthBreakdown(symbols)}
        tone="info"
      />
      <KpiCard
        label="Recent Anomalies"
        value={String(anomalies.length)}
        description="Current summary window"
        tone={anomalies.length > 0 ? "warning" : "healthy"}
      />
    </section>
  );
}

function ServiceHealthCard({ status }: { status: string | null | undefined }) {
  const tone = toStatusTone(status, "neutral");
  const palette = serviceHealthPalette(tone);

  return (
    <article className="sg-panel flex min-h-28 items-center gap-4 overflow-hidden px-4 py-4">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${palette.icon}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 96 96"
          className={`h-8 w-8 ${palette.pulse}`}
          fill="none"
        >
          <circle cx="48" cy="48" r="32" stroke="currentColor" strokeOpacity="0.18" />
          <path
            d="M18 50h14l8-18 13 38 9-24h16"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="6"
          />
        </svg>
      </div>

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
}: {
  label: string;
  value: string;
  description: string;
  tone?: StatusTone;
}) {
  return (
    <article className="sg-panel flex min-h-28 flex-col justify-between px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        <TickerDot status={tone} />
      </div>
      <div>
        <p className="text-2xl font-extrabold tracking-tight text-white">{value}</p>
        <p className="mt-1 text-sm leading-5 text-slate-400">{description}</p>
      </div>
    </article>
  );
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
  const signalPath = selectedSymbol
    ? buildSignalPath(selectedSymbol, selectedAnomalies)
    : null;

  return (
    <section className="sg-panel overflow-hidden px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 border-b border-white/10 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-400">Market Signal View</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-white">
            Summary-backed signal preview
          </h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">
            Latest summary-backed signal preview for monitored market data.
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
        <LoadingSkeleton className="mt-4 h-48" />
      ) : !selectedSymbol || !signalPath ? (
        <EmptyBlock message="No monitored symbol state available for the signal preview." />
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#0b141d] p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-sm font-bold text-white">
                  {selectedSymbol.symbol}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Latest state with recent anomaly markers
                </p>
              </div>
              {selectedAnomalies.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedAnomalies.slice(0, 3).map((anomaly) => (
                    <span
                      key={anomaly.id}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${anomalyMarkerBadgeClass(
                        anomaly.severity,
                      )}`}
                    >
                      {anomaly.severity}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">
                  No recent anomalies
                </p>
              )}
            </div>

            <div className="relative min-h-44 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/70">
              <svg
                aria-label={`${selectedSymbol.symbol} summary-backed signal preview`}
                className="h-44 w-full"
                preserveAspectRatio="none"
                viewBox="0 0 100 52"
                role="img"
              >
                <defs>
                  <linearGradient id="signalArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(120 224 93)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="rgb(120 224 93)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {[10, 20, 30, 40].map((y) => (
                  <line
                    key={`grid-y-${y}`}
                    stroke="rgb(71 85 105)"
                    strokeOpacity="0.22"
                    strokeWidth="0.35"
                    x1="0"
                    x2="100"
                    y1={y}
                    y2={y}
                  />
                ))}
                {[16, 32, 48, 64, 80].map((x) => (
                  <line
                    key={`grid-x-${x}`}
                    stroke="rgb(71 85 105)"
                    strokeOpacity="0.16"
                    strokeWidth="0.3"
                    x1={x}
                    x2={x}
                    y1="0"
                    y2="52"
                  />
                ))}
                <path d={signalPath.area} fill="url(#signalArea)" />
                <path
                  d={signalPath.line}
                  fill="none"
                  stroke="rgb(126 228 91)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.35"
                />
                {selectedAnomalies.slice(0, 5).map((anomaly, index) => (
                  <AnomalyMarker
                    key={anomaly.id}
                    anomaly={anomaly}
                    index={index}
                    total={Math.min(selectedAnomalies.length, 5)}
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between px-4 pb-3 text-xs font-medium text-slate-500">
                <span>Latest state</span>
                <span>Summary preview</span>
              </div>
            </div>

            <p className="mt-2 text-xs leading-5 text-slate-500">
              This preview is derived from the latest dashboard summary snapshot,
              not a historical price series.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <SignalMetric
              label="Symbol"
              value={selectedSymbol.symbol}
            />
            <SignalMetric
              label="Price"
              value={formatTickerPrice(selectedSymbol.state?.last_trade_price)}
            />
            <SignalMetric
              label="Spread"
              value={formatTickerPercent(selectedSymbol.state?.spread_pct)}
            />
            <SignalMetric
              label="Trades/min"
              value={formatOptionalCompact(selectedSymbol.state?.trades_per_minute)}
            />
            <SignalMetric
              label="Freshness"
              value={formatOptionalAge(
                selectedSymbol.state?.last_event_age_ms ??
                  summary?.pipeline.last_message_age_ms,
              )}
            />
            <SignalMetric
              label="Anomalies"
              value={String(selectedAnomalies.length)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function AnomalyMarker({
  anomaly,
  index,
  total,
}: {
  anomaly: DashboardAnomaly;
  index: number;
  total: number;
}) {
  const x = 14 + ((index + 1) * 72) / (total + 1);
  const tone = anomalyMarkerTone(anomaly.severity);

  return (
    <g>
      <line
        stroke={tone.stroke}
        strokeDasharray="1.6 1.8"
        strokeOpacity="0.8"
        strokeWidth="0.75"
        x1={x}
        x2={x}
        y1="7"
        y2="46"
      />
      <circle
        cx={x}
        cy="8"
        fill={tone.fill}
        r="2.6"
        stroke={tone.stroke}
        strokeOpacity="0.9"
        strokeWidth="0.8"
      />
      <title>
        {anomaly.symbol} {anomaly.anomaly_type} {anomaly.severity}
      </title>
    </g>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-base font-bold text-white">{value}</p>
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
    <section className="grid gap-4 xl:grid-cols-2">
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
    <section className="sg-panel overflow-hidden bg-[#0b121c] px-5 py-5">
      <SectionTitle title="Symbol Health" />
      {isLoading ? (
        <LoadingSkeleton className="mt-5 h-48" />
      ) : symbols.length > 0 ? (
        <>
          <div className="mt-5 hidden lg:block">
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
      <td className="py-3.5 pr-4">
        <Link
          to={`/symbols/${symbol.symbol}`}
          className="font-mono text-base font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {symbol.symbol}
        </Link>
      </td>
      <td className="py-3.5 pr-4">
        <HealthScore score={score} status={symbol.health?.status} />
      </td>
      <td className="py-3.5 pr-4 text-sm font-semibold text-slate-100">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </td>
      <td className="py-3.5 pr-4 text-sm font-semibold text-slate-300">
        {formatTickerPercent(symbol.state?.spread_pct)}
      </td>
      <td className="py-3.5 pr-4 text-sm font-semibold text-slate-300">
        {formatOptionalCompact(symbol.state?.trades_per_minute)}
      </td>
      <td className="py-3.5 text-right">
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
    <section className="sg-panel overflow-hidden bg-[#0b121c] px-5 py-5">
      <SectionTitle title="Recent Anomalies" action={<Link to="/anomalies">View all</Link>} />
      {isLoading ? (
        <LoadingSkeleton className="mt-5 h-48" />
      ) : anomalies.length > 0 ? (
        <>
          <div className="mt-5 hidden lg:block">
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
      <td className="py-3.5 pr-4 text-sm font-semibold text-slate-300">
        {formatAnomalyTime(anomaly.event_time || anomaly.created_at)}
      </td>
      <td className="py-3.5 pr-4">
        <Link
          to={`/symbols/${anomaly.symbol}`}
          className="font-mono text-sm font-bold text-slate-50 transition hover:text-cyan-200"
        >
          {anomaly.symbol}
        </Link>
      </td>
      <td className="py-3.5 pr-4 text-sm font-bold text-slate-100">
        {formatAnomalyType(anomaly.anomaly_type)}
      </td>
      <td className="py-3.5 pr-4">
        <SeverityBadge severity={anomaly.severity} />
      </td>
      <td className={`py-3.5 pr-4 text-sm font-bold ${anomalyValueClass(severityTone)}`}>
        {formatAnomalyValue(anomaly.anomaly_type, anomaly.observed_value, "observed")}
      </td>
      <td className="py-3.5 text-sm font-semibold text-slate-300">
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
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
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

function buildSignalPath(
  symbol: DashboardSymbolSummary,
  anomalies: DashboardAnomaly[],
): { line: string; area: string } {
  const score = symbol.health?.score ?? 55;
  const spread = symbol.state?.spread_pct ?? 0;
  const tradeRate = symbol.state?.trades_per_minute ?? 0;
  const agePenalty = Math.min((symbol.state?.last_event_age_ms ?? 0) / 30_000, 8);
  const anomalyPenalty = Math.min(anomalies.length * 3, 12);
  const base = clamp(42 - score * 0.24 + spread * 16 + agePenalty + anomalyPenalty, 10, 40);
  const activity = clamp(tradeRate / 12, 0, 7);
  const statusLift =
    symbol.health?.status === "healthy"
      ? -4
      : symbol.health?.status === "degraded"
        ? 2
        : symbol.health?.status === "unhealthy"
          ? 5
          : 0;

  const points = [
    [5, clamp(base + 5 - activity, 8, 44)],
    [18, clamp(base + statusLift, 8, 44)],
    [32, clamp(base - 5 - activity / 2, 8, 44)],
    [48, clamp(base - 1 + anomalyPenalty / 2, 8, 44)],
    [64, clamp(base - 7 + activity, 8, 44)],
    [82, clamp(base - 3 + statusLift, 8, 44)],
    [96, clamp(base - 9 + anomalyPenalty / 3, 8, 44)],
  ];

  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const area = `${line} L 96 52 L 5 52 Z`;

  return { line, area };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function anomalyMarkerTone(severity: DashboardAnomaly["severity"]): {
  fill: string;
  stroke: string;
} {
  switch (severity) {
    case "critical":
      return {
        fill: "rgb(255 92 77)",
        stroke: "rgb(255 107 95)",
      };
    case "warning":
      return {
        fill: "rgb(245 181 27)",
        stroke: "rgb(245 197 66)",
      };
    case "info":
      return {
        fill: "rgb(99 167 255)",
        stroke: "rgb(99 167 255)",
      };
    default:
      return {
        fill: "rgb(148 163 184)",
        stroke: "rgb(148 163 184)",
      };
  }
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

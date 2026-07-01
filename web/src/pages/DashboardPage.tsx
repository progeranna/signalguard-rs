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
  formatDecimalString,
  formatPercent,
  formatTimestamp,
} from "@/shared/lib/format";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

export function DashboardPage() {
  const dashboardSummaryQuery = useDashboardSummaryQuery();
  const summary = dashboardSummaryQuery.data ?? null;

  return (
    <section className="space-y-5 lg:space-y-6">
      <DashboardHeader summary={summary} isLoading={dashboardSummaryQuery.isLoading} />

      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          title="Dashboard summary unavailable"
          message={buildErrorMessage(dashboardSummaryQuery.error)}
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      <DashboardTickerShell summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <DashboardSummaryGrid summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <MarketSignalShell summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
      <DashboardTablesGrid summary={summary} isLoading={dashboardSummaryQuery.isLoading} />
    </section>
  );
}

function DashboardHeader({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  const pipelineStatus = summary?.pipeline.status;

  return (
    <header className="sg-panel overflow-hidden px-5 py-5 sm:px-6 lg:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/80">
            Dashboard
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Market-data quality overview
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Live service health, symbol freshness, and anomaly signals for the
              public market-data pipeline.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={pipelineStatus ? toStatusTone(pipelineStatus) : "neutral"}
            text={isLoading ? "Loading" : pipelineStatus ?? "Unavailable"}
          />
          <StatusBadge status="ok" text="Read only" />
        </div>
      </div>
    </header>
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

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 shadow-[0_14px_45px_rgba(2,6,23,0.22)]">
      {isLoading ? (
        <LoadingSkeleton className="h-8" />
      ) : symbols.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {symbols.slice(0, 8).map((symbol) => (
            <TickerItem key={symbol.symbol} symbol={symbol} />
          ))}
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-400">
          No symbols reporting in the current summary window.
        </p>
      )}
    </section>
  );
}

function TickerItem({ symbol }: { symbol: DashboardSymbolSummary }) {
  const status = symbol.health?.status ?? "unknown";
  const anomalyCount = symbol.health?.recent_anomaly_count ?? 0;

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200">
      <span className="font-mono text-white">{symbol.symbol}</span>
      <TickerDot status={toStatusTone(symbol.health?.status, "neutral")} />
      <span className="uppercase text-slate-300">{status}</span>
      <span className="text-slate-500">/</span>
      <span>{formatDecimalString(symbol.state?.last_trade_price)}</span>
      <span className="text-slate-500">/</span>
      <span>spread {formatPercent(symbol.state?.spread_pct)}</span>
      <span className="text-slate-500">/</span>
      <span>{anomalyCount} anomalies</span>
    </div>
  );
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

function DashboardSummaryGrid({
  summary,
  isLoading,
}: {
  summary: DashboardSummary | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[minmax(0,_1.55fr)_minmax(320px,_0.95fr)]">
        <LoadingSkeleton className="h-56" />
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <LoadingSkeleton className="h-28" />
          <LoadingSkeleton className="h-28" />
          <LoadingSkeleton className="h-28" />
        </div>
      </section>
    );
  }

  const symbols = summary?.symbols ?? [];
  const anomalies = summary?.recent_anomalies ?? [];
  const pipelineStatus = summary?.pipeline.status;

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,_1.55fr)_minmax(320px,_0.95fr)]">
      <ServiceHealthCard status={pipelineStatus} />

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
        <KpiCard
          label="Tracked symbols"
          value={String(symbols.length)}
          description="Markets in view"
          tone="info"
        />
        <KpiCard
          label="Recent anomalies"
          value={String(anomalies.length)}
          description="Current summary window"
          tone={anomalies.length > 0 ? "warning" : "healthy"}
        />
        <KpiCard
          label="Freshness"
          value={formatOptionalAge(summary?.pipeline.last_message_age_ms)}
          description="Latest pipeline message"
          tone={pipelineStatus ? toStatusTone(pipelineStatus) : "neutral"}
        />
      </div>
    </section>
  );
}

function ServiceHealthCard({ status }: { status: string | null | undefined }) {
  const tone = toStatusTone(status, "neutral");
  const palette = serviceHealthPalette(tone);

  return (
    <article className="sg-panel flex min-h-56 flex-col gap-6 overflow-hidden border-slate-700/70 bg-[#0b111b] px-6 py-6 sm:flex-row sm:items-center sm:px-8 sm:py-8">
      <div
        className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border sm:h-28 sm:w-28 ${palette.icon}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 96 96"
          className={`h-16 w-16 sm:h-20 sm:w-20 ${palette.pulse}`}
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
        <p className="text-lg font-semibold text-slate-400">Service Health</p>
        <p className={`mt-3 text-5xl font-extrabold leading-none tracking-tight ${palette.text}`}>
          {statusLabel(status)}
        </p>
        <p className="mt-4 text-lg font-semibold leading-7 text-slate-200">
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
    <article className="sg-panel flex min-h-28 flex-col justify-between rounded-2xl px-4 py-4">
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
  const primarySymbol = summary?.symbols[0] ?? null;

  return (
    <section className="sg-panel px-5 py-5 sm:px-6 lg:px-7">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-400">Market signal view</p>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-white">
            Price, activity, and anomaly context
          </h3>
        </div>
        <StatusBadge status="info" text="Preview" />
      </div>

      {isLoading ? (
        <LoadingSkeleton className="mt-5 h-64" />
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_0.5fr]">
          <div className="min-h-64 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,_rgba(15,23,42,0.72),_rgba(2,6,23,0.72))] p-5">
            <div className="flex h-full min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/35 px-5 text-center">
              <p className="max-w-md text-sm leading-6 text-slate-300">
                Signal visualization will use summary-backed market data without
                presenting synthetic live history.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <SignalMetric
              label="Symbol"
              value={primarySymbol?.symbol ?? "Unknown"}
            />
            <SignalMetric
              label="Last price"
              value={formatDecimalString(primarySymbol?.state?.last_trade_price)}
            />
            <SignalMetric
              label="Events / min"
              value={formatCompactNumber(primarySymbol?.state?.trades_per_minute)}
            />
            <SignalMetric
              label="Parse errors"
              value={String(summary?.pipeline.parse_errors ?? 0)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold text-white">{value}</p>
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
    <section className="sg-panel px-5 py-5">
      <SectionTitle title="Symbol health" action={<Link to="/symbols/BTCUSDT">BTCUSDT</Link>} />
      {isLoading ? (
        <LoadingSkeleton className="mt-5 h-48" />
      ) : symbols.length > 0 ? (
        <div className="mt-5 space-y-3">
          {symbols.slice(0, 4).map((symbol) => (
            <SymbolHealthRow key={symbol.symbol} symbol={symbol} />
          ))}
        </div>
      ) : (
        <EmptyBlock message="No symbols returned by the dashboard summary." />
      )}
    </section>
  );
}

function SymbolHealthRow({ symbol }: { symbol: DashboardSymbolSummary }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="font-mono text-base font-bold text-white">{symbol.symbol}</p>
        <p className="mt-1 text-sm text-slate-400">
          Price {formatDecimalString(symbol.state?.last_trade_price)} / Spread{" "}
          {formatPercent(symbol.state?.spread_pct)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <span className="text-sm font-semibold text-slate-300">
          Score {symbol.health?.score ?? "Unknown"}
        </span>
        <StatusBadge
          status={toStatusTone(symbol.health?.status, "neutral")}
          text={symbol.health?.status ?? "Unknown"}
        />
      </div>
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
    <section className="sg-panel px-5 py-5">
      <SectionTitle title="Recent anomalies" action={<Link to="/anomalies">View all</Link>} />
      {isLoading ? (
        <LoadingSkeleton className="mt-5 h-48" />
      ) : anomalies.length > 0 ? (
        <div className="mt-5 space-y-3">
          {anomalies.slice(0, 4).map((anomaly) => (
            <AnomalyRow key={anomaly.id} anomaly={anomaly} />
          ))}
        </div>
      ) : (
        <EmptyBlock message="No recent anomalies in the current summary." />
      )}
    </section>
  );
}

function AnomalyRow({ anomaly }: { anomaly: DashboardAnomaly }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <p className="text-base font-bold text-white">{anomaly.anomaly_type}</p>
        <p className="mt-1 text-sm text-slate-400">
          {anomaly.symbol} / {formatTimestamp(anomaly.event_time)}
        </p>
      </div>
      <StatusBadge
        status={toStatusTone(anomaly.severity, "neutral")}
        text={anomaly.severity}
      />
    </div>
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

function formatOptionalAge(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return formatAgeMs(value);
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

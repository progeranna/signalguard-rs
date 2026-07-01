import { Link } from "react-router-dom";

import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import { MetricCard } from "@/shared/components/MetricCard";
import { ErrorPanel } from "@/shared/components/ErrorPanel";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { PageHeader } from "@/shared/components/PageHeader";
import { StatusBadge } from "@/shared/components/StatusBadge";
import {
  formatAgeMs,
  formatCompactNumber,
  formatDecimalString,
  formatPercent,
  formatTimestamp,
} from "@/shared/lib/format";
import { isApiError, isApiValidationError } from "@/shared/api/errors";
import { toStatusTone } from "@/shared/lib/status";

const placeholderSections = [
  {
    label: "Service snapshot",
    value: "Pipeline + service status",
    description: "This page will bootstrap from the compact dashboard summary endpoint.",
  },
  {
    label: "Symbol coverage",
    value: "Tracked market set",
    description: "Latest per-symbol state and health summaries will render here.",
  },
  {
    label: "Recent anomalies",
    value: "Detector output",
    description: "The first iteration will preview the latest emitted anomaly events.",
  },
];

export function DashboardPage() {
  const dashboardSummaryQuery = useDashboardSummaryQuery();

  const symbols = dashboardSummaryQuery.data?.symbols ?? [];
  const recentAnomalies = dashboardSummaryQuery.data?.recent_anomalies ?? [];

  return (
    <section className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Cross-symbol operational visibility"
        description="This first dashboard iteration reads the compact summary payload and exposes the contract through lightweight cards. It remains intentionally narrow: no charts, no control surface, and no invented metrics."
        actions={
          <StatusBadge
            status={
              dashboardSummaryQuery.data
                ? toStatusTone(dashboardSummaryQuery.data.pipeline.status, "info")
                : "info"
            }
            text={
              dashboardSummaryQuery.data
                ? dashboardSummaryQuery.data.pipeline.status
                : "Summary contract"
            }
          />
        }
      />

      {dashboardSummaryQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <LoadingSkeleton className="h-40" />
          <LoadingSkeleton className="h-40" />
          <LoadingSkeleton className="h-40" />
        </div>
      ) : null}

      {dashboardSummaryQuery.isError ? (
        <ErrorPanel
          message={buildErrorMessage(dashboardSummaryQuery.error)}
          onRetry={() => void dashboardSummaryQuery.refetch()}
        />
      ) : null}

      {dashboardSummaryQuery.data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Service status"
              value={dashboardSummaryQuery.data.service.status}
              description={`Service identity: ${dashboardSummaryQuery.data.service.service}`}
              tone="ok"
            />
            <MetricCard
              label="Tracked symbols"
              value={String(symbols.length)}
              description="Symbols returned by the dashboard bootstrap response."
              tone="healthy"
            />
            <MetricCard
              label="Recent anomalies"
              value={String(recentAnomalies.length)}
              description="Recent detector events included in the compact summary."
              tone={recentAnomalies.length > 0 ? "warning" : "neutral"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="sg-panel px-6 py-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
                    Symbol summaries
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Latest state and health contract preview
                  </h3>
                </div>
                <StatusBadge
                  status={toStatusTone(dashboardSummaryQuery.data.pipeline.status)}
                  text={dashboardSummaryQuery.data.pipeline.status}
                />
              </div>
              <div className="space-y-3">
                {symbols.length > 0 ? (
                  symbols.slice(0, 6).map((symbol) => (
                    <div
                      key={symbol.symbol}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {symbol.symbol}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">
                            Last event {formatTimestamp(symbol.state?.last_event_time ?? null)}
                          </p>
                        </div>
                        <StatusBadge
                          status={toStatusTone(symbol.health?.status, "neutral")}
                          text={symbol.health?.status ?? "state pending"}
                        />
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MiniMetric
                          label="Last trade"
                          value={formatDecimalString(symbol.state?.last_trade_price ?? null)}
                        />
                        <MiniMetric
                          label="Spread"
                          value={formatPercent(symbol.state?.spread_pct ?? null)}
                        />
                        <MiniMetric
                          label="Trade rate"
                          value={formatCompactNumber(
                            symbol.state?.trades_per_minute ?? null,
                          )}
                        />
                        <MiniMetric
                          label="Age"
                          value={formatAgeMs(symbol.state?.last_event_age_ms ?? null)}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-300">
                    The summary endpoint returned no tracked symbols yet.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <MetricCard
                label="Last message age"
                value={formatAgeMs(
                  dashboardSummaryQuery.data.pipeline.last_message_age_ms,
                )}
                description="Pipeline freshness from the shared health counters."
                tone={toStatusTone(dashboardSummaryQuery.data.pipeline.status)}
              />
              <MetricCard
                label="Parse errors"
                value={String(dashboardSummaryQuery.data.pipeline.parse_errors)}
                description="Cumulative parse failures reported by the pipeline counters."
                tone={
                  dashboardSummaryQuery.data.pipeline.parse_errors > 0
                    ? "warning"
                    : "healthy"
                }
              />
              <MetricCard
                label="Storage/cache errors"
                value={String(
                  dashboardSummaryQuery.data.pipeline.storage_errors +
                    dashboardSummaryQuery.data.pipeline.cache_errors,
                )}
                description="Combined storage and cache error counters from the dashboard summary."
                tone={
                  dashboardSummaryQuery.data.pipeline.storage_errors > 0 ||
                  dashboardSummaryQuery.data.pipeline.cache_errors > 0
                    ? "critical"
                    : "healthy"
                }
              />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {placeholderSections.map((section) => (
            <MetricCard
              key={section.label}
              label={section.label}
              value={section.value}
              description={section.description}
              tone="neutral"
            />
          ))}
        </div>
      )}

      <div className="sg-panel flex flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
            Next drill-down
          </p>
          <h3 className="text-xl font-semibold text-white">
            Symbol pages and anomaly views stay separate from the summary layer
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-slate-300">
            The dashboard will remain compact. Deeper symbol and anomaly reads
            continue to use the existing backend endpoints documented in
            `docs/web-console.md`.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/symbols/BTCUSDT"
            className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Open sample symbol
          </Link>
          <Link
            to="/anomalies"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08]"
          >
            Review anomalies page
          </Link>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-3 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
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

import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";

import { StatusBadge } from "@/shared/components/StatusBadge";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

import {
  availabilityMessage,
  formatOptionalCompact,
  formatOptionalAge,
  formatTickerPercent,
  formatTickerPrice,
  statusLabel,
} from "./marketHealthPresentation";

export type MarketHealthMobileCardsProps = Readonly<{
  rows: readonly MarketHealthPreviewRow[];
  onOpenSymbolDetail: (symbol: string) => void;
}>;

export function MarketHealthMobileCards({
  onOpenSymbolDetail,
  rows,
}: MarketHealthMobileCardsProps) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
      {rows.map((row) => (
        <MarketHealthMobileCard
          key={row.key}
          onOpenSymbolDetail={onOpenSymbolDetail}
          row={row}
        />
      ))}
    </div>
  );
}

function MarketHealthMobileCard({
  onOpenSymbolDetail,
  row,
}: Readonly<{
  onOpenSymbolDetail: (symbol: string) => void;
  row: MarketHealthPreviewRow;
}>) {
  const statusTone = toStatusTone(row.healthStatus, "neutral");
  const statusText = marketStatusLabel(row);

  return (
    <button
      type="button"
      onClick={() => {
        onOpenSymbolDetail(row.symbol);
      }}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${row.symbol} market detail`}
    >
      <article>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono text-lg font-bold text-white">
              {row.symbol}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              View market detail
            </p>
          </div>
          <StatusBadge status={statusTone} text={statusText} />
        </div>
        {row.observed ? (
          <div className="mt-4">
            <HealthScore
              score={row.healthScore}
              status={row.healthStatus}
            />
          </div>
        ) : null}
        {row.observed ? (
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MobileSymbolMetric
              label="Price"
              value={formatTickerPrice(row.lastTradePrice)}
            />
            <MobileSymbolMetric
              label="Spread"
              value={formatTickerPercent(row.spreadPct)}
            />
            <MobileSymbolMetric
              label="Trades/min"
              value={formatOptionalCompact(row.tradesPerMinute)}
            />
            <MobileSymbolMetric
              label="Age"
              value={formatOptionalAge(row.lastEventAgeMs)}
            />
          </div>
        ) : (
          <div className="mt-4">
            <EmptyBlock message={availabilityMessage(row.availability)} />
          </div>
        )}
      </article>
    </button>
  );
}

export function MobileSymbolMetric({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  );
}

export function EmptyBlock({ message }: Readonly<{ message: string }>) {
  return (
    <div className="border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400">
      {message}
    </div>
  );
}

function marketStatusLabel(row: MarketHealthPreviewRow): string {
  switch (row.availability) {
    case "configured":
      return "Configured";
    case "awaiting":
      return "Awaiting data";
    case "unavailable":
      return "Unavailable";
    case "observed":
      return statusLabel(row.healthStatus);
  }
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

function HealthScore({
  compact = false,
  score,
  status,
}: Readonly<{
  compact?: boolean;
  score: number | null;
  status: string | null | undefined;
}>) {
  const tone = healthScoreTone(score, status);
  const width = score === null ? 0 : Math.max(score, 4);

  return (
    <div className={compact ? "min-w-0" : "min-w-28"}>
      <div
        className={
          compact
            ? "flex min-w-0 items-center gap-2"
            : "flex items-center gap-3"
        }
      >
        <span className={`text-lg font-extrabold ${healthScoreTextClass(tone)}`}>
          {score ?? "—"}
        </span>
        <div
          className={
            compact
              ? "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/70"
              : "h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70"
          }
        >
          <div
            className={`h-full rounded-full ${healthScoreBarClass(tone)}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

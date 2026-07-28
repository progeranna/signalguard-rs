import type { KeyboardEvent } from "react";

import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatCompactNumber } from "@/shared/lib/format";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";

export type MarketHealthDesktopTableProps = Readonly<{
  rows: readonly MarketHealthPreviewRow[];
  onOpenSymbolDetail: (symbol: string) => void;
}>;

export function MarketHealthDesktopTable({
  rows,
  onOpenSymbolDetail,
}: MarketHealthDesktopTableProps) {
  return (
    <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block">
      <table
        aria-label="Market health"
        className="w-full table-fixed border-collapse text-left"
      >
        <colgroup>
          <col className="w-[18%]" />
          <col className="w-[22%]" />
          <col className="w-[16%]" />
          <col className="w-[11%]" />
          <col className="w-[14%]" />
          <col className="w-[19%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <th className="px-2 py-3 pr-2">Market</th>
            <th className="px-2 py-3 pr-2">Health Score</th>
            <th className="px-2 py-3 pr-2">Last Price</th>
            <th className="px-2 py-3 pr-2">Spread</th>
            <th className="px-2 py-3 pr-2">Trades/min</th>
            <th className="px-2 py-3 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <MarketHealthDesktopRow
              key={row.key}
              row={row}
              onOpenSymbolDetail={onOpenSymbolDetail}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketHealthDesktopRow({
  row,
  onOpenSymbolDetail,
}: Readonly<{
  row: MarketHealthPreviewRow;
  onOpenSymbolDetail: (symbol: string) => void;
}>) {
  const statusTone = toStatusTone(row.healthStatus, "neutral");
  const statusText = marketStatusLabel(row);

  function handleOpenSymbol() {
    onOpenSymbolDetail(row.symbol);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenSymbol();
    }
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Open ${row.symbol} market detail`}
      onClick={handleOpenSymbol}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 last:border-0"
    >
      <td className="min-w-0 px-2 py-3 pr-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-mono text-sm font-bold text-slate-50">
            {row.symbol}
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:inline">
            View
          </span>
        </div>
      </td>
      <td className="px-2 py-3 pr-4">
        {row.observed ? (
          <HealthScore
            compact
            score={row.healthScore}
            status={row.healthStatus}
          />
        ) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-100 2xl:text-sm">
        {row.observed ? formatTickerPrice(row.lastTradePrice) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {row.observed ? formatTickerPercent(row.spreadPct) : null}
      </td>
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {row.observed ? formatOptionalCompact(row.tradesPerMinute) : null}
      </td>
      <td className="px-2 py-3 text-right">
        <div className="flex min-w-0 justify-end overflow-hidden">
          <StatusBadge status={statusTone} text={statusText} />
        </div>
      </td>
    </tr>
  );
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

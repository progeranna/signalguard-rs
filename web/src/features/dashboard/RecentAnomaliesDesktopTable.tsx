import type { KeyboardEvent } from "react";

import type { RecentAnomaliesPreviewRow } from "./recentAnomaliesPreviewModel";

export type RecentAnomaliesDesktopTableProps = Readonly<{
  rows: readonly RecentAnomaliesPreviewRow[];
  onOpenSymbolDetail: (symbol: string) => void;
}>;

type AnomalyStatusTone =
  RecentAnomaliesPreviewRow["severityDescriptor"]["tone"];

export function RecentAnomaliesDesktopTable({
  rows,
  onOpenSymbolDetail,
}: RecentAnomaliesDesktopTableProps) {
  return (
    <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain border-y border-white/10 lg:block">
      <table
        aria-label="Recent anomalies"
        className="w-full table-fixed border-collapse text-left"
      >
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[16%]" />
          <col className="w-[20%]" />
          <col className="w-[19%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <th className="px-2 py-3 pr-2">Time</th>
            <th className="px-2 py-3 pr-2">Market</th>
            <th className="px-2 py-3 pr-2">Type</th>
            <th className="px-2 py-3 pr-2">Severity</th>
            <th className="px-2 py-3 pr-2">Observed</th>
            <th className="px-2 py-3">Threshold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RecentAnomalyDesktopRow
              key={row.id}
              row={row}
              onOpenSymbolDetail={onOpenSymbolDetail}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentAnomalyDesktopRow({
  row,
  onOpenSymbolDetail,
}: Readonly<{
  row: RecentAnomaliesPreviewRow;
  onOpenSymbolDetail: (symbol: string) => void;
}>) {
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
      <td className="whitespace-nowrap px-2 py-3 pr-2 text-xs font-semibold text-slate-300 2xl:text-sm">
        {formatAnomalyTime(row.eventTime || row.createdAt)}
      </td>
      <td className="min-w-0 px-2 py-3 pr-2">
        <span className="block min-w-0 truncate font-mono text-xs font-bold text-slate-50 2xl:text-sm">
          {row.symbol}
        </span>
      </td>
      <td className="min-w-0 break-words px-2 py-3 pr-2 text-xs font-bold leading-4 text-slate-100 2xl:text-sm">
        {row.detectorLabel}
      </td>
      <td className="min-w-0 px-2 py-3 pr-2">
        <span
          className={`inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2 py-1 text-[10px] tracking-[0.08em] 2xl:px-2.5 2xl:text-xs 2xl:tracking-[0.12em] ${severityBadgeClass(
            row.severityDescriptor.tone,
          )}`}
        >
          {row.severityDescriptor.label}
        </span>
      </td>
      <td
        className={`whitespace-nowrap px-2 py-3 pr-2 text-xs font-bold 2xl:text-sm ${anomalyValueClass(
          row.severityDescriptor.tone,
        )}`}
      >
        {formatAnomalyValue(row.anomalyType, row.observedValue, "observed")}
      </td>
      <td className="whitespace-nowrap px-2 py-3 text-xs font-semibold text-slate-300 2xl:text-sm">
        {formatAnomalyValue(row.anomalyType, row.thresholdValue, "threshold")}
      </td>
    </tr>
  );
}

function severityBadgeClass(tone: AnomalyStatusTone): string {
  switch (tone) {
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

function anomalyValueClass(tone: AnomalyStatusTone): string {
  switch (tone) {
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
    case "stale_data":
    case "quote_stuck":
      return formatDurationValue(value);
    case "trade_burst":
      return `${formatIntegerValue(value)} /m`;
    case "depth_sequence_gap":
      return `${formatIntegerValue(value)} ${
        role === "threshold" ? "limit" : "gap"
      }`;
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

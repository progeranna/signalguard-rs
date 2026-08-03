import type { KeyboardEvent } from "react";

import type { RecentAnomaliesPreviewRow } from "./recentAnomaliesPreviewModel";
import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyValue,
  severityBadgeClass,
} from "./recentAnomaliesPresentation";

export type RecentAnomaliesDesktopTableProps = Readonly<{
  rows: readonly RecentAnomaliesPreviewRow[];
  onOpenAnomalyDetail: (anomalyId: string) => void;
}>;

export function RecentAnomaliesDesktopTable({
  rows,
  onOpenAnomalyDetail,
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
            <AnomalyTableRow
              key={row.id}
              row={row}
              onOpenAnomalyDetail={onOpenAnomalyDetail}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyTableRow({
  row,
  onOpenAnomalyDetail,
}: Readonly<{
  row: RecentAnomaliesPreviewRow;
  onOpenAnomalyDetail: (anomalyId: string) => void;
}>) {
  function handleOpenAnomaly() {
    onOpenAnomalyDetail(row.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenAnomaly();
    }
  }

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`Open ${row.symbol} ${row.detectorLabel} anomaly detail ${row.id}`}
      onClick={handleOpenAnomaly}
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
        <SeverityBadge row={row} />
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

function SeverityBadge({ row }: Readonly<{ row: RecentAnomaliesPreviewRow }>) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2 py-1 text-[10px] tracking-[0.08em] 2xl:px-2.5 2xl:text-xs 2xl:tracking-[0.12em] ${severityBadgeClass(
        row.severityDescriptor.tone,
      )}`}
    >
      {row.severityDescriptor.label}
    </span>
  );
}

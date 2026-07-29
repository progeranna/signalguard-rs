import type { RecentAnomaliesPreviewRow } from "./recentAnomaliesPreviewModel";

import { MobileSymbolMetric } from "./MarketHealthMobileCards";
import {
  anomalyValueClass,
  formatAnomalyTime,
  formatAnomalyValue,
  severityBadgeClass,
} from "./recentAnomaliesPresentation";

export type RecentAnomaliesMobileCardsProps = Readonly<{
  rows: readonly RecentAnomaliesPreviewRow[];
  onOpenSymbolDetail: (symbol: string) => void;
}>;

export function RecentAnomaliesMobileCards({
  rows,
  onOpenSymbolDetail,
}: RecentAnomaliesMobileCardsProps) {
  return (
    <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
      {rows.map((row) => (
        <button
          key={row.id}
          type="button"
          onClick={() => onOpenSymbolDetail(row.symbol)}
          className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          aria-label={`Open ${row.symbol} market detail`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="font-mono text-base font-bold text-white transition">
                {row.symbol}
              </span>
              <p className="mt-2 text-base font-bold text-slate-100">
                {row.detectorLabel}
              </p>
            </div>
            <SeverityBadge row={row} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <MobileSymbolMetric
              label="Observed"
              value={formatAnomalyValue(
                row.anomalyType,
                row.observedValue,
                "observed",
              )}
            />
            <MobileSymbolMetric
              label="Threshold"
              value={formatAnomalyValue(
                row.anomalyType,
                row.thresholdValue,
                "threshold",
              )}
            />
            <MobileSymbolMetric
              label="Time"
              value={formatAnomalyTime(row.eventTime || row.createdAt)}
            />
            <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Severity
              </p>
              <p
                className={`mt-1 text-sm font-bold ${anomalyValueClass(
                  row.severityDescriptor.tone,
                )}`}
              >
                {row.severityDescriptor.label}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function SeverityBadge({ row }: Readonly<{ row: RecentAnomaliesPreviewRow }>) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap rounded-full border font-bold uppercase px-2.5 py-1 text-xs tracking-[0.12em] ${severityBadgeClass(
        row.severityDescriptor.tone,
      )}`}
    >
      {row.severityDescriptor.label}
    </span>
  );
}

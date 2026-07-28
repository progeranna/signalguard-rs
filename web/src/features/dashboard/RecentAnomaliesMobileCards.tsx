import type { RecentAnomaliesPreviewRow } from "./recentAnomaliesPreviewModel";

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
            <MobileMetric
              label="Observed"
              value={formatAnomalyValue(
                row.anomalyType,
                row.observedValue,
                "observed",
              )}
            />
            <MobileMetric
              label="Threshold"
              value={formatAnomalyValue(
                row.anomalyType,
                row.thresholdValue,
                "threshold",
              )}
            />
            <MobileMetric
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

function MobileMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
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

function severityBadgeClass(
  tone: RecentAnomaliesPreviewRow["severityDescriptor"]["tone"],
): string {
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

function anomalyValueClass(
  tone: RecentAnomaliesPreviewRow["severityDescriptor"]["tone"],
): string {
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

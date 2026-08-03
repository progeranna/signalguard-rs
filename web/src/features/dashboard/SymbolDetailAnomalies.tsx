import type { MarketAnomalyViewModel, MarketDetailViewModel } from "./marketViewModel";

const EMPTY_MESSAGE = "No recent anomalies for this market.";
const ANOMALY_METRIC_CARD_CLASS = "rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3";
const ANOMALY_MOBILE_DIVIDER_CLASS = "divide-y divide-white/10 border-y border-white/10 lg:hidden";
const ANOMALY_TABLE_CELL_PADDING_CLASS = "px-2 py-3 pr-4";
const ANOMALY_TABLE_CELL_CLASS = "px-2 py-3 pr-4 text-sm font-semibold text-slate-300";
const POPUP_SEVERITY_CLASS: Record<MarketAnomalyViewModel["severity"]["key"], string> = {
  critical: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  warning: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  info: "border-sky-400/35 bg-sky-400/10 text-sky-200",
};

export type SymbolDetailAnomaliesProps = Readonly<{
  symbol: MarketDetailViewModel["identity"]["symbol"];
  anomalies: MarketDetailViewModel["anomalies"];
  onOpenAnomalyDetail: (anomalyId: MarketAnomalyViewModel["id"]) => void;
}>;

export function SymbolDetailAnomalies(props: SymbolDetailAnomaliesProps) {
  const { anomalies } = props;

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-white">
            Recent market anomalies
          </h3>
          <p className="mt-1 text-sm leading-5 text-slate-400">
            Quality events for this market in the current summary.
          </p>
        </div>
      </div>

      {anomalies.length > 0 ? (
        <AnomalyPresentation
          anomalies={anomalies}
          onOpenAnomalyDetail={props.onOpenAnomalyDetail}
        />
      ) : (
        <div className="border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400">
          {EMPTY_MESSAGE}
        </div>
      )}
    </section>
  );
}

function AnomalyPresentation({
  anomalies,
  onOpenAnomalyDetail,
}: Pick<SymbolDetailAnomaliesProps, "anomalies" | "onOpenAnomalyDetail">) {
  return (
    <>
      <AnomalyDesktopTable
        anomalies={anomalies}
        onOpenAnomalyDetail={onOpenAnomalyDetail}
      />
      <div className={ANOMALY_MOBILE_DIVIDER_CLASS}>
        {anomalies.map((anomaly) => (
          <AnomalyMobileItem
            key={anomaly.id}
            anomaly={anomaly}
            onOpenAnomalyDetail={onOpenAnomalyDetail}
          />
        ))}
      </div>
    </>
  );
}

function AnomalyDesktopTable({
  anomalies,
  onOpenAnomalyDetail,
}: Readonly<{
  anomalies: MarketDetailViewModel["anomalies"];
  onOpenAnomalyDetail: SymbolDetailAnomaliesProps["onOpenAnomalyDetail"];
}>) {
  return (
    <div className="hidden overflow-hidden border-y border-white/10 lg:block">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Type</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Severity</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Observed</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Threshold</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Detected</th>
            <th className="px-2 py-3">Context</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.map((anomaly) => (
            <AnomalyDesktopRow
              key={anomaly.id}
              anomaly={anomaly}
              onOpenAnomalyDetail={onOpenAnomalyDetail}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyDesktopRow({
  anomaly,
  onOpenAnomalyDetail,
}: Readonly<{
  anomaly: MarketAnomalyViewModel;
  onOpenAnomalyDetail: SymbolDetailAnomaliesProps["onOpenAnomalyDetail"];
}>) {
  function handleOpenAnomaly() {
    onOpenAnomalyDetail(anomaly.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleOpenAnomaly();
    }
  }

  return (
    <tr
      role="button"
      tabIndex={0}
      aria-label={`Open ${anomaly.symbol} ${anomaly.type} anomaly detail ${anomaly.id}`}
      data-anomaly-id={anomaly.id}
      onClick={handleOpenAnomaly}
      onKeyDown={handleKeyDown}
      className="cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400/40 last:border-0"
    >
      <td className="px-2 py-3 pr-4 text-sm font-bold text-slate-100">
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        <PopupSeverityBadge
          severity={anomaly.severity.key}
          text={anomaly.severity.text}
        />
      </td>
      <td className={`${ANOMALY_TABLE_CELL_PADDING_CLASS} text-sm font-bold ${anomaly.valueClassName}`}>
        {anomaly.observed}
      </td>
      <td className={ANOMALY_TABLE_CELL_CLASS}>
        {anomaly.threshold}
      </td>
      <td className={ANOMALY_TABLE_CELL_CLASS}>
        {anomaly.detected}
      </td>
      <td className="px-2 py-3 text-sm leading-5 text-slate-400">
        {anomaly.context}
      </td>
    </tr>
  );
}

function AnomalyMobileItem({
  anomaly,
  onOpenAnomalyDetail,
}: Readonly<{
  anomaly: MarketAnomalyViewModel;
  onOpenAnomalyDetail: SymbolDetailAnomaliesProps["onOpenAnomalyDetail"];
}>) {
  return (
    <button
      type="button"
      onClick={() => onOpenAnomalyDetail(anomaly.id)}
      aria-label={`Open ${anomaly.symbol} ${anomaly.type} anomaly detail ${anomaly.id}`}
      data-anomaly-id={anomaly.id}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-base font-bold text-white transition">
            {anomaly.symbol}
          </span>
          <p className="mt-2 text-base font-bold text-slate-100">{anomaly.type}</p>
        </div>
        <PopupSeverityBadge
          severity={anomaly.severity.key}
          text={anomaly.severity.text}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <PopupMobileMetric label="Observed" value={anomaly.observed} />
        <PopupMobileMetric label="Threshold" value={anomaly.threshold} />
        <PopupMobileMetric label="Detected" value={anomaly.detected} />
        <PopupMobileMetric
          label="Severity"
          value={anomaly.severity.text}
          valueClassName={anomaly.valueClassName}
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.context}</p>
    </button>
  );
}

function PopupMobileMetric({
  label,
  value,
  valueClassName = "text-slate-100",
}: Readonly<{
  label: string;
  value: string;
  valueClassName?: string;
}>) {
  return (
    <div className={ANOMALY_METRIC_CARD_CLASS}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-sm font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function PopupSeverityBadge({
  severity,
  text,
}: Readonly<{
  severity: MarketAnomalyViewModel["severity"]["key"];
  text: MarketAnomalyViewModel["severity"]["text"];
}>) {
  return (
    <span
      className={`inline-flex max-w-full whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${POPUP_SEVERITY_CLASS[severity]}`}
    >
      {text}
    </span>
  );
}

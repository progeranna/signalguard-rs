import type { MarketAnomalyViewModel, MarketDetailViewModel } from "./marketViewModel";

import { StatusBadge } from "@/shared/components/StatusBadge";

const EMPTY_MESSAGE = "No recent anomalies for this market.";

export type SymbolDetailAnomaliesProps =
  | Readonly<{
      variant: "route";
      symbol: MarketDetailViewModel["identity"]["symbol"];
      anomalies: MarketDetailViewModel["anomalies"];
    }>
  | Readonly<{
      variant: "popup";
      symbol: MarketDetailViewModel["identity"]["symbol"];
      anomalies: MarketDetailViewModel["anomalies"];
      onOpenSymbolDetail: (symbol: MarketAnomalyViewModel["symbol"]) => void;
    }>;

export function SymbolDetailAnomalies(props: SymbolDetailAnomaliesProps) {
  const { anomalies } = props;

  return (
    <section className="space-y-3">
      {props.variant === "route" ? (
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Recent anomalies for {props.symbol}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Latest quality events for the selected market.
          </p>
        </div>
      ) : (
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
      )}

      {anomalies.length > 0 ? (
        props.variant === "route" ? (
          <RouteAnomaliesPresentation anomalies={anomalies} />
        ) : (
          <PopupAnomaliesPresentation
            anomalies={anomalies}
            onOpenSymbolDetail={props.onOpenSymbolDetail}
          />
        )
      ) : (
        <div
          className={
            props.variant === "route"
              ? "border-y border-white/10 px-2 py-5 text-sm text-slate-400"
              : "border-y border-white/10 px-2 py-5 text-sm leading-6 text-slate-400"
          }
        >
          {EMPTY_MESSAGE}
        </div>
      )}
    </section>
  );
}

function RouteAnomaliesPresentation({
  anomalies,
}: Readonly<{ anomalies: MarketDetailViewModel["anomalies"] }>) {
  return (
    <>
      <div className="hidden overflow-hidden border-y border-white/10 lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-2 py-3 pr-4">Type</th>
              <th className="px-2 py-3 pr-4">Severity</th>
              <th className="px-2 py-3 pr-4">Observed</th>
              <th className="px-2 py-3 pr-4">Threshold</th>
              <th className="px-2 py-3 pr-4">Detected at</th>
              <th className="px-2 py-3">Context</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((anomaly) => (
              <RouteAnomalyTableRow key={anomaly.id} anomaly={anomaly} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
        {anomalies.map((anomaly) => (
          <RouteAnomalyMobileRow key={anomaly.id} anomaly={anomaly} />
        ))}
      </div>
    </>
  );
}

function RouteAnomalyTableRow({
  anomaly,
}: Readonly<{ anomaly: MarketAnomalyViewModel }>) {
  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-100">
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        <StatusBadge
          status={anomaly.severity.tone}
          text={anomaly.severity.text}
        />
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.observed.route}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.threshold.route}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.detectedAt}
      </td>
      <td className="px-2 py-3 text-sm text-slate-400">{anomaly.context}</td>
    </tr>
  );
}

function RouteAnomalyMobileRow({
  anomaly,
}: Readonly<{ anomaly: MarketAnomalyViewModel }>) {
  return (
    <article className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{anomaly.type}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
            {anomaly.detectedAt}
          </p>
        </div>
        <StatusBadge
          status={anomaly.severity.tone}
          text={anomaly.severity.text}
        />
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <RouteMobileValue label="Observed" value={anomaly.observed.route} />
        <RouteMobileValue label="Threshold" value={anomaly.threshold.route} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        {anomaly.context}
      </p>
    </article>
  );
}

function RouteMobileValue({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function PopupAnomaliesPresentation({
  anomalies,
  onOpenSymbolDetail,
}: Readonly<{
  anomalies: MarketDetailViewModel["anomalies"];
  onOpenSymbolDetail: (symbol: MarketAnomalyViewModel["symbol"]) => void;
}>) {
  return (
    <>
      <div className="hidden overflow-hidden border-y border-white/10 lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <th className="px-2 py-3 pr-4">Type</th>
              <th className="px-2 py-3 pr-4">Severity</th>
              <th className="px-2 py-3 pr-4">Observed</th>
              <th className="px-2 py-3 pr-4">Threshold</th>
              <th className="px-2 py-3 pr-4">Detected</th>
              <th className="px-2 py-3">Context</th>
            </tr>
          </thead>
          <tbody>
            {anomalies.map((anomaly) => (
              <PopupAnomalyTableRow key={anomaly.id} anomaly={anomaly} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-white/10 border-y border-white/10 lg:hidden">
        {anomalies.map((anomaly) => (
          <PopupAnomalyMobileCard
            key={anomaly.id}
            anomaly={anomaly}
            onOpenSymbolDetail={onOpenSymbolDetail}
          />
        ))}
      </div>
    </>
  );
}

function PopupAnomalyTableRow({
  anomaly,
}: Readonly<{ anomaly: MarketAnomalyViewModel }>) {
  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className="px-2 py-3 pr-4 text-sm font-bold text-slate-100">
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        <PopupSeverityBadge
          severity={anomaly.severity.key}
          text={anomaly.severity.text}
        />
      </td>
      <td className={`px-2 py-3 pr-4 text-sm font-bold ${anomaly.valueClassName}`}>
        {anomaly.observed.popup}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.threshold.popup}
      </td>
      <td className="px-2 py-3 pr-4 text-sm font-semibold text-slate-300">
        {anomaly.detected}
      </td>
      <td className="px-2 py-3 text-sm leading-5 text-slate-400">
        {anomaly.context}
      </td>
    </tr>
  );
}

function PopupAnomalyMobileCard({
  anomaly,
  onOpenSymbolDetail,
}: Readonly<{
  anomaly: MarketAnomalyViewModel;
  onOpenSymbolDetail: (symbol: MarketAnomalyViewModel["symbol"]) => void;
}>) {
  return (
    <button
      type="button"
      onClick={() => onOpenSymbolDetail(anomaly.symbol)}
      className="block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
      aria-label={`Open ${anomaly.symbol} market detail`}
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
        <PopupMobileMetric label="Observed" value={anomaly.observed.popup} />
        <PopupMobileMetric label="Threshold" value={anomaly.threshold.popup} />
        <PopupMobileMetric label="Detected" value={anomaly.detected} />
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Severity
          </p>
          <p className={`mt-1 text-sm font-bold ${anomaly.valueClassName}`}>
            {anomaly.severity.text}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.context}</p>
    </button>
  );
}

function PopupMobileMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-100">{value}</p>
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
      className={`inline-flex max-w-full whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${popupSeverityBadgeClass(
        severity,
      )}`}
    >
      {text}
    </span>
  );
}

function popupSeverityBadgeClass(
  severity: MarketAnomalyViewModel["severity"]["key"],
): string {
  switch (severity) {
    case "critical":
      return "border-rose-400/35 bg-rose-400/10 text-rose-200";
    case "warning":
      return "border-amber-400/35 bg-amber-400/10 text-amber-200";
    case "info":
      return "border-sky-400/35 bg-sky-400/10 text-sky-200";
  }
}

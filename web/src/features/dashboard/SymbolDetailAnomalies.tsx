import type { MarketAnomalyViewModel, MarketDetailViewModel } from "./marketViewModel";

import { StatusBadge } from "@/shared/components/StatusBadge";

const EMPTY_MESSAGE = "No recent anomalies for this market.";
const ANOMALY_LABEL_CLASS = "text-xs font-semibold uppercase tracking-[0.14em] text-slate-500";
const ANOMALY_METRIC_CARD_CLASS = "rounded-xl border border-white/[0.08] bg-slate-950/35 px-3 py-3";
const ANOMALY_MOBILE_DIVIDER_CLASS = "divide-y divide-white/10 border-y border-white/10 lg:hidden";
const ANOMALY_TABLE_CELL_PADDING_CLASS = "px-2 py-3 pr-4";
const ANOMALY_TABLE_CELL_CLASS = "px-2 py-3 pr-4 text-sm font-semibold text-slate-300";
const POPUP_SEVERITY_CLASS: Record<MarketAnomalyViewModel["severity"]["key"], string> = {
  critical: "border-rose-400/35 bg-rose-400/10 text-rose-200",
  warning: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  info: "border-sky-400/35 bg-sky-400/10 text-sky-200",
};

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
        <AnomalyPresentation {...props} />
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

function AnomalyPresentation(props: SymbolDetailAnomaliesProps) {
  const { anomalies } = props;

  return (
    <>
      <AnomalyDesktopTable variant={props.variant} anomalies={anomalies} />
      <div className={ANOMALY_MOBILE_DIVIDER_CLASS}>
        {props.variant === "popup"
          ? anomalies.map((anomaly) => (
              <AnomalyMobileItem
                key={anomaly.id}
                variant="popup"
                anomaly={anomaly}
                onOpenSymbolDetail={props.onOpenSymbolDetail}
              />
            ))
          : anomalies.map((anomaly) => (
              <AnomalyMobileItem key={anomaly.id} variant="route" anomaly={anomaly} />
            ))}
      </div>
    </>
  );
}

function AnomalyDesktopTable({
  variant,
  anomalies,
}: Readonly<{
  variant: "route" | "popup";
  anomalies: MarketDetailViewModel["anomalies"];
}>) {
  const popup = variant === "popup";

  return (
    <div className="hidden overflow-hidden border-y border-white/10 lg:block">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Type</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Severity</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Observed</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>Threshold</th>
            <th className={ANOMALY_TABLE_CELL_PADDING_CLASS}>{popup ? "Detected" : "Detected at"}</th>
            <th className="px-2 py-3">Context</th>
          </tr>
        </thead>
        <tbody>
          {anomalies.map((anomaly) => (
            <AnomalyDesktopRow key={anomaly.id} variant={variant} anomaly={anomaly} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnomalyDesktopRow({
  variant,
  anomaly,
}: Readonly<{
  variant: "route" | "popup";
  anomaly: MarketAnomalyViewModel;
}>) {
  const popup = variant === "popup";

  return (
    <tr className="border-b border-white/[0.06] transition hover:bg-white/[0.025] last:border-0">
      <td className={`px-2 py-3 pr-4 text-sm ${popup ? "font-bold" : "font-semibold"} text-slate-100`}>
        {anomaly.type}
      </td>
      <td className="px-2 py-3 pr-4">
        {popup ? (
          <PopupSeverityBadge
            severity={anomaly.severity.key}
            text={anomaly.severity.text}
          />
        ) : (
          <StatusBadge
            status={anomaly.severity.tone}
            text={anomaly.severity.text}
          />
        )}
      </td>
      <td
        className={
          popup
            ? `${ANOMALY_TABLE_CELL_PADDING_CLASS} text-sm font-bold ${anomaly.valueClassName}`
            : ANOMALY_TABLE_CELL_CLASS
        }
      >
        {popup ? anomaly.observed.popup : anomaly.observed.route}
      </td>
      <td className={ANOMALY_TABLE_CELL_CLASS}>
        {popup ? anomaly.threshold.popup : anomaly.threshold.route}
      </td>
      <td className={ANOMALY_TABLE_CELL_CLASS}>
        {popup ? anomaly.detected : anomaly.detectedAt}
      </td>
      <td
        className={
          popup
            ? "px-2 py-3 text-sm leading-5 text-slate-400"
            : "px-2 py-3 text-sm text-slate-400"
        }
      >
        {anomaly.context}
      </td>
    </tr>
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

function AnomalyMobileItem(
  props:
    | Readonly<{
        variant: "route";
        anomaly: MarketAnomalyViewModel;
      }>
    | Readonly<{
        variant: "popup";
        anomaly: MarketAnomalyViewModel;
        onOpenSymbolDetail: (symbol: MarketAnomalyViewModel["symbol"]) => void;
      }>,
) {
  const popup = props.variant === "popup";
  const anomaly = props.anomaly;
  const Container = popup ? "button" : "article";

  return (
    <Container
      {...(popup
        ? {
            type: "button" as const,
            onClick: () => props.onOpenSymbolDetail(anomaly.symbol),
            "aria-label": `Open ${anomaly.symbol} market detail`,
          }
        : {})}
      className={
        popup
          ? "block w-full py-4 text-left transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
          : "py-4"
      }
    >
      <div className={popup ? "flex items-start justify-between gap-4" : "flex items-start justify-between gap-3"}>
        <div>
          {popup ? (
            <>
              <span className="font-mono text-base font-bold text-white transition">
                {anomaly.symbol}
              </span>
              <p className="mt-2 text-base font-bold text-slate-100">{anomaly.type}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">{anomaly.type}</p>
              <p className={ANOMALY_LABEL_CLASS}>
                {anomaly.detectedAt}
              </p>
            </>
          )}
        </div>
        {popup ? (
          <PopupSeverityBadge
            severity={anomaly.severity.key}
            text={anomaly.severity.text}
          />
        ) : (
          <StatusBadge
            status={anomaly.severity.tone}
            text={anomaly.severity.text}
          />
        )}
      </div>
      {popup ? (
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <PopupMobileMetric label="Observed" value={anomaly.observed.popup} />
          <PopupMobileMetric label="Threshold" value={anomaly.threshold.popup} />
          <PopupMobileMetric label="Detected" value={anomaly.detected} />
          <PopupMobileMetric
            label="Severity"
            value={anomaly.severity.text}
            valueClassName={anomaly.valueClassName}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <RouteMobileValue label="Observed" value={anomaly.observed.route} />
          <RouteMobileValue label="Threshold" value={anomaly.threshold.route} />
        </div>
      )}
      <p className="mt-3 text-sm leading-6 text-slate-400">{anomaly.context}</p>
    </Container>
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
      <p className={ANOMALY_LABEL_CLASS}>
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

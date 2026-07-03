import { useDashboardSummaryQuery } from "@/features/dashboard/api";
import { orderMarketEntries } from "@/features/dashboard/marketOrder";
import { useResolvedUiMode } from "@/features/dashboard/uiMode";
import type {
  DashboardAnomaly,
  DashboardSymbolSummary,
} from "@/features/dashboard/types";
import { LoadingSkeleton } from "@/shared/components/LoadingSkeleton";
import { toStatusTone, type StatusTone } from "@/shared/lib/status";

export function GlobalMarketTicker() {
  const selectedUiMode = useResolvedUiMode();
  const dashboardSummaryQuery = useDashboardSummaryQuery(selectedUiMode);
  const summary = dashboardSummaryQuery.data ?? null;
  const symbols = orderMarketEntries(summary?.symbols ?? [], (symbol) => symbol.symbol);
  const anomalies = summary?.recent_anomalies ?? [];
  const tickerKey = buildTickerKey(symbols);

  return (
    <section
      aria-label="Market quality ticker"
      className=" bg-[#050A11] py-2"
    >
      {dashboardSummaryQuery.isLoading ? (
        <div className="mx-auto max-w-[1680px] px-4 sm:px-6 lg:px-8">
          <LoadingSkeleton className="h-7" />
        </div>
      ) : dashboardSummaryQuery.isError ? (
        <p className="mx-auto max-w-[1680px] px-4 text-sm font-medium text-slate-400 sm:px-6 lg:px-8">
          Market ticker unavailable
        </p>
      ) : symbols.length > 0 ? (
        <div className="overflow-x-auto lg:overflow-hidden">
          <div
            key={tickerKey}
            className="flex w-max min-w-full gap-2 sg-ticker-track"
          >
            <TickerItemGroup symbols={symbols} anomalies={anomalies} />
            <div aria-hidden="true" className="flex gap-2">
              <TickerItemGroup symbols={symbols} anomalies={anomalies} />
            </div>
            <div aria-hidden="true" className="flex gap-2">
              <TickerItemGroup symbols={symbols} anomalies={anomalies} />
            </div>
            <div aria-hidden="true" className="flex gap-2">
              <TickerItemGroup symbols={symbols} anomalies={anomalies} />
            </div>
          </div>
        </div>
      ) : (
        <p className="mx-auto max-w-[1680px] px-4 text-sm font-medium text-slate-400 sm:px-6 lg:px-8">
          No market health data available
        </p>
      )}
    </section>
  );
}

function buildTickerKey(symbols: DashboardSymbolSummary[]): string {
  return symbols
    .map((symbol) =>
      [
        symbol.symbol,
        symbol.state?.last_event_time ?? "none",
        symbol.state?.last_trade_price ?? "none",
        symbol.health?.status ?? "unknown",
      ].join(":"),
    )
    .join("|");
}

function TickerItemGroup({
  symbols,
  anomalies,
}: {
  symbols: DashboardSymbolSummary[];
  anomalies: DashboardAnomaly[];
}) {
  return (
    <div className="flex gap-2">
      {symbols.slice(0, 8).map((symbol) => (
        <TickerItem
          key={symbol.symbol}
          symbol={symbol}
          anomalies={anomalies.filter((anomaly) => anomaly.symbol === symbol.symbol)}
        />
      ))}
    </div>
  );
}

function TickerItem({
  symbol,
  anomalies,
}: {
  symbol: DashboardSymbolSummary;
  anomalies: DashboardAnomaly[];
}) {
  const status = symbol.health?.status ?? null;
  const statusTone = toStatusTone(status, "neutral");
  const anomalyCount = anomalies.length;
  const hasCriticalAnomaly = anomalies.some((anomaly) => anomaly.severity === "critical");

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-200">
      <span className="font-mono text-[13px] font-bold text-slate-50">
        {symbol.symbol}
      </span>
      <TickerSeparator />
      <span className={`inline-flex items-center gap-2 ${tickerStatusClass(statusTone)}`}>
        <TickerDot status={statusTone} />
        {statusLabel(status)}
      </span>
      <TickerSeparator />
      <span className="text-slate-100">
        {formatTickerPrice(symbol.state?.last_trade_price)}
      </span>
      <TickerSeparator />
      <span className={tickerSpreadClass(statusTone)}>
        spread {formatTickerPercent(symbol.state?.spread_pct)}
      </span>
      <TickerSeparator />
      <span className={tickerAnomalyClass(anomalyCount, hasCriticalAnomaly)}>
        {anomalyCount} {anomalyCount === 1 ? "anomaly" : "anomalies"}
      </span>
    </div>
  );
}

function TickerSeparator() {
  return <span className="text-slate-600">·</span>;
}

function TickerDot({ status }: { status: StatusTone }) {
  const className =
    status === "healthy"
      ? "bg-emerald-300"
      : status === "degraded" || status === "warning"
        ? "bg-amber-300"
        : status === "unhealthy" || status === "critical"
          ? "bg-rose-300"
          : "bg-slate-500";

  return <span className={`h-2 w-2 rounded-full ${className}`} />;
}

function tickerStatusClass(status: StatusTone): string {
  switch (status) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
    case "warning":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function tickerSpreadClass(status: StatusTone): string {
  switch (status) {
    case "degraded":
    case "warning":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function tickerAnomalyClass(count: number, hasCriticalAnomaly: boolean): string {
  if (hasCriticalAnomaly || count >= 3) {
    return "text-rose-300";
  }

  if (count > 0) {
    return "text-amber-300";
  }

  return "text-emerald-300";
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

function statusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

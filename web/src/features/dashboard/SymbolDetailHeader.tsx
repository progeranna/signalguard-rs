import { StatusBadge } from "@/shared/components/StatusBadge";
import type { StatusTone } from "@/shared/lib/status";

type CommonSymbolDetailHeaderProps = {
  symbol: string;
  statusTone: StatusTone;
  statusText: string;
};

export type SymbolDetailHeaderProps =
  | (CommonSymbolDetailHeaderProps & {
      variant: "route";
      sourceLabel: "Demo" | "Live" | "Unavailable";
    })
  | (CommonSymbolDetailHeaderProps & {
      variant: "popup";
      sourceLabel: "Demo" | "Live";
    });

export function SymbolDetailHeader({
  symbol,
  statusTone,
  statusText,
  sourceLabel,
  variant,
}: SymbolDetailHeaderProps) {
  if (variant === "route") {
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/80">
          Dashboard / Market
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {symbol}
          </h1>
          <StatusBadge status={statusTone} text={statusText} />
          <StatusBadge status="neutral" text={sourceLabel} />
        </div>
        <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
          Market-level market-data quality, freshness, and anomaly context.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-mono text-2xl font-bold text-white">{symbol}</p>
      <StatusBadge status={statusTone} text={statusText} />
      <StatusBadge status="neutral" text={sourceLabel} />
    </div>
  );
}

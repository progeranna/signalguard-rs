import { StatusBadge } from "@/shared/components/StatusBadge";
import type { StatusTone } from "@/shared/lib/status";

const HEADER_LAYOUT_CLASS = "flex flex-wrap items-center gap-3";

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
  const badges = (
    <>
      <StatusBadge status={statusTone} text={statusText} />
      <StatusBadge status="neutral" text={sourceLabel} />
    </>
  );

  if (variant === "route") {
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/80">
          Dashboard / Market
        </p>
        <div className={HEADER_LAYOUT_CLASS}>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {symbol}
          </h1>
          {badges}
        </div>
        <p className="max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
          Market-level market-data quality, freshness, and anomaly context.
        </p>
      </div>
    );
  }

  return (
    <div className={HEADER_LAYOUT_CLASS}>
      <p className="font-mono text-2xl font-bold text-white">{symbol}</p>
      {badges}
    </div>
  );
}

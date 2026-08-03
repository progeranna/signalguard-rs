import { StatusBadge } from "@/shared/components/StatusBadge";
import type { StatusTone } from "@/shared/lib/status";

const HEADER_LAYOUT_CLASS = "flex flex-wrap items-center gap-3";

export type SymbolDetailHeaderProps = {
  symbol: string;
  sourceLabel: "Demo" | "Live";
  statusTone: StatusTone;
  statusText: string;
};

export function SymbolDetailHeader({
  symbol,
  statusTone,
  statusText,
  sourceLabel,
}: SymbolDetailHeaderProps) {
  const badges = (
    <>
      <StatusBadge status={statusTone} text={statusText} />
      <StatusBadge status="neutral" text={sourceLabel} />
    </>
  );

  return (
    <div className={HEADER_LAYOUT_CLASS}>
      <p className="font-mono text-2xl font-bold text-white">{symbol}</p>
      {badges}
    </div>
  );
}

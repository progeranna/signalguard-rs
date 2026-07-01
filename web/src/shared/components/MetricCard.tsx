import { StatusBadge } from "@/shared/components/StatusBadge";
import type { StatusTone } from "@/shared/lib/status";

type MetricCardProps = {
  label: string;
  value: string;
  description: string;
  tone?: StatusTone;
};

export function MetricCard({
  label,
  value,
  description,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <article className="sg-panel flex h-full flex-col gap-4 px-5 py-5">
      <div className="flex items-start justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-slate-400">
          {label}
        </p>
        <StatusBadge status={tone} />
      </div>
      <div className="space-y-2">
        <p className="text-2xl font-semibold tracking-tight text-white">{value}</p>
        <p className="text-sm leading-6 text-slate-300">{description}</p>
      </div>
    </article>
  );
}

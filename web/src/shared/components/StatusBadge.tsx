import { statusToneMap, type StatusTone } from "@/shared/lib/status";

type StatusBadgeProps = {
  status: StatusTone;
  text?: string;
};

export function StatusBadge({ status, text }: StatusBadgeProps) {
  const tone = statusToneMap[status];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${tone.className}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dotClassName}`} />
      {text ?? tone.label}
    </span>
  );
}

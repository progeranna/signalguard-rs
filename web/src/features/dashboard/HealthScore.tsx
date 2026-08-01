import type { StatusTone } from "@/shared/lib/status";

export function HealthScore({
  compact = false,
  score,
  status,
}: Readonly<{
  compact?: boolean;
  score: number | null;
  status: string | null | undefined;
}>) {
  const tone = healthScoreTone(score, status);
  const width = score === null ? 0 : Math.max(score, 4);

  return (
    <div className={compact ? "min-w-0" : "min-w-28"}>
      <div
        className={
          compact
            ? "flex min-w-0 items-center gap-2"
            : "flex items-center gap-3"
        }
      >
        <span className={`text-lg font-extrabold ${healthScoreTextClass(tone)}`}>
          {score ?? "—"}
        </span>
        <div
          className={
            compact
              ? "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/70"
              : "h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70"
          }
        >
          <div
            className={`h-full rounded-full ${healthScoreBarClass(tone)}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function healthScoreTone(
  score: number | null,
  status: string | null | undefined,
): StatusTone {
  if (status === "healthy" || (score !== null && score >= 80)) {
    return "healthy";
  }

  if (status === "degraded" || (score !== null && score >= 50)) {
    return "degraded";
  }

  if (status === "unhealthy" || (score !== null && score < 50)) {
    return "unhealthy";
  }

  return "neutral";
}

function healthScoreTextClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "text-emerald-300";
    case "degraded":
      return "text-amber-300";
    case "unhealthy":
    case "critical":
      return "text-rose-300";
    default:
      return "text-slate-400";
  }
}

function healthScoreBarClass(tone: StatusTone): string {
  switch (tone) {
    case "healthy":
      return "bg-emerald-300";
    case "degraded":
      return "bg-amber-300";
    case "unhealthy":
    case "critical":
      return "bg-rose-300";
    default:
      return "bg-slate-500";
  }
}

export type StatusTone =
  | "ok"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "info"
  | "warning"
  | "critical"
  | "neutral";

type StatusToneConfig = {
  label: string;
  className: string;
  dotClassName: string;
};

export const statusToneMap: Record<StatusTone, StatusToneConfig> = {
  ok: {
    label: "OK",
    className: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    dotClassName: "bg-cyan-300",
  },
  healthy: {
    label: "Healthy",
    className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    dotClassName: "bg-emerald-300",
  },
  degraded: {
    label: "Degraded",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    dotClassName: "bg-amber-300",
  },
  unhealthy: {
    label: "Unhealthy",
    className: "border-orange-400/30 bg-orange-400/10 text-orange-100",
    dotClassName: "bg-orange-300",
  },
  info: {
    label: "Info",
    className: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    dotClassName: "bg-sky-300",
  },
  warning: {
    label: "Warning",
    className: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    dotClassName: "bg-amber-300",
  },
  critical: {
    label: "Critical",
    className: "border-rose-400/30 bg-rose-400/10 text-rose-100",
    dotClassName: "bg-rose-300",
  },
  neutral: {
    label: "Neutral",
    className: "border-white/10 bg-white/5 text-slate-200",
    dotClassName: "bg-slate-400",
  },
};

export function toStatusTone(
  value: string | null | undefined,
  fallback: StatusTone = "neutral",
): StatusTone {
  if (!value) {
    return fallback;
  }

  switch (value) {
    case "ok":
    case "healthy":
    case "degraded":
    case "unhealthy":
    case "info":
    case "warning":
    case "critical":
      return value;
    default:
      return fallback;
  }
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(2)}%`;
}

export function formatAgeMs(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  if (value < 1_000) {
    return `${value} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1_000).toFixed(1)} s`;
  }

  if (value < 3_600_000) {
    return `${(value / 60_000).toFixed(1)} min`;
  }

  return `${(value / 3_600_000).toFixed(1)} hr`;
}

export function formatDecimalString(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  return value;
}

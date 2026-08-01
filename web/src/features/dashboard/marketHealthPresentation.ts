import { formatAgeMs, formatCompactNumber } from "@/shared/lib/format";

import type { MarketHealthPreviewRow } from "./marketHealthPreviewModel";

export function formatTickerPrice(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value;
}

export function formatTickerPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${value.toFixed(2)}%`;
}

export function formatOptionalCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return formatCompactNumber(value);
}

export function formatOptionalAge(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return formatAgeMs(value);
}

export function statusLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function availabilityMessage(
  availability: MarketHealthPreviewRow["availability"],
): string {
  switch (availability) {
    case "configured":
      return "Configured for Live; Live ingestion is not active.";
    case "awaiting":
      return "Awaiting first Live market data.";
    case "unavailable":
      return "Live market data is unavailable.";
    case "observed":
      return "No current market state available for this market.";
  }
}

export function marketStatusLabel(
  availability: MarketHealthPreviewRow["availability"],
  healthStatus: MarketHealthPreviewRow["healthStatus"] | undefined,
): string {
  switch (availability) {
    case "configured":
      return "Configured";
    case "awaiting":
      return "Awaiting data";
    case "unavailable":
      return "Unavailable";
    case "observed":
      return statusLabel(healthStatus);
  }
}

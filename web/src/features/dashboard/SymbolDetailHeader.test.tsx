import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SymbolDetailHeader,
  type SymbolDetailHeaderProps,
} from "./SymbolDetailHeader";

const componentSource = readFileSync(
  path.join(process.cwd(), "src/features/dashboard/SymbolDetailHeader.tsx"),
  "utf8",
);

function renderHeader(props: SymbolDetailHeaderProps) {
  return render(<SymbolDetailHeader {...props} />);
}

function badgeText(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span.inline-flex")).map(
    (badge) => badge.textContent,
  );
}

function staticImportSpecifiers(source: string): string[] {
  return Array.from(
    source.matchAll(
      /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?/g,
    ),
    (match) => match[1]!,
  );
}

describe("SymbolDetailHeader route variant", () => {
  it("preserves the route symbol, copy, hierarchy, and badge order", () => {
    const { container } = renderHeader({
      variant: "route",
      symbol: "BTCUSDT",
      statusTone: "healthy",
      statusText: "Healthy",
      sourceLabel: "Demo",
    });

    expect(screen.getByRole("heading", { level: 1, name: "BTCUSDT" })).toBeInTheDocument();
    expect(screen.getByText("Dashboard / Market")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Market-level market-data quality, freshness, and anomaly context.",
      ),
    ).toBeInTheDocument();
    expect(badgeText(container)).toEqual(["Healthy", "Demo"]);
    expect(container.querySelector("h1")).toHaveClass(
      "text-3xl",
      "font-semibold",
      "tracking-tight",
      "text-white",
      "sm:text-4xl",
    );
  });

  it("preserves the route Unavailable source label without deriving it", () => {
    const { container } = renderHeader({
      variant: "route",
      symbol: "DOGEUSDT",
      statusTone: "neutral",
      statusText: "Market state is unavailable while Live data is not observed.",
      sourceLabel: "Unavailable",
    });

    expect(badgeText(container)).toEqual([
      "Market state is unavailable while Live data is not observed.",
      "Unavailable",
    ]);
    expect(
      screen.getByText("Market state is unavailable while Live data is not observed."),
    ).toBeInTheDocument();
  });
});

describe("SymbolDetailHeader popup variant", () => {
  it("preserves the compact symbol and Live source label", () => {
    const { container } = renderHeader({
      variant: "popup",
      symbol: "ETHUSDT",
      statusTone: "degraded",
      statusText: "Degraded",
      sourceLabel: "Live",
    });

    expect(screen.getByText("ETHUSDT")).toHaveClass(
      "font-mono",
      "text-2xl",
      "font-bold",
      "text-white",
    );
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard / Market")).not.toBeInTheDocument();
    expect(badgeText(container)).toEqual(["Degraded", "Live"]);
  });
});

describe("SymbolDetailHeader status presentation", () => {
  it("renders healthy, degraded, unhealthy, and neutral tones with full status text", () => {
    const cases: Array<[SymbolDetailHeaderProps["variant"], string, string]> = [
      ["route", "healthy", "Healthy market data is fresh and consistent."],
      ["popup", "degraded", "Degraded: freshness is outside the expected window."],
      ["route", "unhealthy", "Unhealthy: market data quality requires attention."],
      ["popup", "neutral", "Status text remains presentation-ready and complete."],
    ];

    for (const [variant, statusTone, statusText] of cases) {
      const { container, unmount } = renderHeader({
        variant,
        symbol: "BTCUSDT",
        statusTone: statusTone as SymbolDetailHeaderProps["statusTone"],
        statusText,
        sourceLabel: variant === "route" ? "Demo" : "Live",
      });

      expect(badgeText(container)[0]).toBe(statusText);
      expect(screen.getByText(statusText)).toBeInTheDocument();
      expect(container.querySelector(".truncate")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the source labels presentation-ready for both variants", () => {
    const route = renderHeader({
      variant: "route",
      symbol: "BTCUSDT",
      statusTone: "neutral",
      statusText: "Neutral",
      sourceLabel: "Live",
    });
    expect(badgeText(route.container)).toEqual(["Neutral", "Live"]);
    route.unmount();

    const popup = renderHeader({
      variant: "popup",
      symbol: "BTCUSDT",
      statusTone: "neutral",
      statusText: "Neutral",
      sourceLabel: "Demo",
    });
    expect(badgeText(popup.container)).toEqual(["Neutral", "Demo"]);
  });
});

describe("SymbolDetailHeader ownership boundary", () => {
  it("rejects explicit route, query, resource, storage, browser, network, and time ownership", () => {
    for (const specifier of staticImportSpecifiers(componentSource)) {
      expect(specifier).not.toMatch(/react-router|@tanstack\/react-query/i);
      expect(specifier).not.toMatch(/(?:^|\/)(?:api|queryKeys)$/i);
      expect(specifier).not.toMatch(
        /selectedSymbol|symbolPopup|symbolPopupResource|symbolMarketResource|shared\/api/i,
      );
    }

    expect(componentSource).not.toMatch(
      /\b(?:useQuery|useMutation|useNavigate|useLocation|useParams|useSymbol(?:Popup|Market)Resource)\s*\(/,
    );
    expect(componentSource).not.toMatch(/\b(?:fetch|setTimeout|setInterval)\s*\(/);
    expect(componentSource).not.toMatch(
      /\b(?:localStorage|sessionStorage|WebSocket|XMLHttpRequest|Date\.now)\b/,
    );
    expect(componentSource).not.toMatch(/\bnew\s+Date\s*\(/);
  });

  it("leaves links, controls, and focus behavior to the surrounding container", () => {
    const { container } = renderHeader({
      variant: "popup",
      symbol: "BTCUSDT",
      statusTone: "healthy",
      statusText: "Healthy",
      sourceLabel: "Live",
    });

    expect(container.querySelectorAll("a, button, input, textarea, select, [tabindex]")).toHaveLength(0);
    expect(within(container).queryByRole("link")).not.toBeInTheDocument();
  });
});
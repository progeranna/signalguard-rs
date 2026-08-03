import { readFileSync } from "node:fs";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SymbolDetailHeader } from "./SymbolDetailHeader";

describe("SymbolDetailHeader popup-only presentation", () => {
  it("renders the compact symbol, status, and source badges", () => {
    const { container } = render(
      <SymbolDetailHeader
        symbol="ETHUSDT"
        statusTone="degraded"
        statusText="Degraded"
        sourceLabel="Live"
      />,
    );

    expect(screen.getByText("ETHUSDT")).toHaveClass(
      "font-mono",
      "text-2xl",
      "font-bold",
    );
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(container.querySelector("h1, h2, h3")).not.toBeInTheDocument();
  });

  it.each([
    ["Demo", "healthy", "Healthy"],
    ["Live", "unhealthy", "Unhealthy"],
  ] as const)("preserves %s source and %s status", (sourceLabel, statusTone, statusText) => {
    render(
      <SymbolDetailHeader
        symbol="BTCUSDT"
        statusTone={statusTone}
        statusText={statusText}
        sourceLabel={sourceLabel}
      />,
    );
    expect(screen.getByText(sourceLabel)).toBeInTheDocument();
    expect(screen.getByText(statusText)).toBeInTheDocument();
  });

  it("owns no navigation, data fetching, storage, or controls", () => {
    const source = readFileSync("src/features/dashboard/SymbolDetailHeader.tsx", "utf8");
    expect(source).not.toMatch(/react-router|@tanstack|useNavigate|useLocation|fetch\s*\(/);
    expect(source).not.toMatch(/localStorage|sessionStorage|WebSocket/);

    const { container } = render(
      <SymbolDetailHeader
        symbol="BTCUSDT"
        statusTone="healthy"
        statusText="Healthy"
        sourceLabel="Demo"
      />,
    );
    expect(container.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
  });
});

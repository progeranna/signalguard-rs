import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/pages/DashboardPage.tsx"),
  "utf8",
);

describe("dashboard preview table layout", () => {
  it("keeps the two preview sections in equal shrink-safe desktop columns", () => {
    expect(source).toContain(
      "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
    );
    expect(source).not.toContain("2xl:grid-cols-2");
  });

  it("contains each preview table inside its own half-width section", () => {
    expect(source.match(/min-w-0 overflow-hidden space-y-3/g)).toHaveLength(2);
    expect(source.match(/overflow-x-auto overscroll-x-contain/g)).toHaveLength(2);
  });

  it("uses fixed table layout and explicit six-column sizing", () => {
    expect(source.match(/table-fixed border-collapse/g)).toHaveLength(2);
    expect(source.match(/<colgroup>/g)).toHaveLength(2);
    expect(source.match(/<col className=/g)).toHaveLength(12);
  });

  it("does not restore oversized table minimum widths", () => {
    expect(source).not.toContain("min-w-[48rem]");
    expect(source).not.toContain("min-w-[46rem]");
  });

  it("preserves all visible preview columns", () => {
    for (const heading of [
      "Market",
      "Health Score",
      "Last Price",
      "Spread",
      "Trades/min",
      "Status",
      "Time",
      "Type",
      "Severity",
      "Observed",
      "Threshold",
    ]) {
      expect(source).toContain(`>${heading}</th>`);
    }
  });

  it("keeps the existing mobile card fallbacks", () => {
    expect(source.match(/lg:hidden/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(source).toContain("<SymbolHealthCard");
    expect(source).toContain("<AnomalyCard");
  });
});

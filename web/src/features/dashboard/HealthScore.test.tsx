import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthScore } from "./HealthScore";

function renderHealthScore({
  compact = false,
  score,
  status,
}: Readonly<{
  compact?: boolean;
  score: number | null;
  status: string | null | undefined;
}>) {
  const { container } = render(
    <HealthScore compact={compact} score={score} status={status} />,
  );
  const root = container.firstElementChild;

  expect(root).toBeInstanceOf(HTMLDivElement);
  if (!(root instanceof HTMLDivElement)) {
    throw new Error("Expected the health-score root");
  }

  const layout = root.firstElementChild;
  expect(layout).toBeInstanceOf(HTMLDivElement);
  if (!(layout instanceof HTMLDivElement)) {
    throw new Error("Expected the health-score layout");
  }

  const track = layout.children[1];
  expect(track).toBeInstanceOf(HTMLDivElement);
  if (!(track instanceof HTMLDivElement)) {
    throw new Error("Expected the health-score track");
  }

  const bar = track.firstElementChild;
  expect(bar).toBeInstanceOf(HTMLDivElement);
  if (!(bar instanceof HTMLDivElement)) {
    throw new Error("Expected the health-score bar");
  }

  return {
    bar,
    layout,
    root,
    text: screen.getByText(String(score ?? "—"), { selector: "span" }),
    track,
  };
}

describe("HealthScore tone and minimum-width contract", () => {
  it.each([
    ["null", null, null, "—", "text-slate-400", "bg-slate-500", "0%"],
    ["zero", 0, null, "0", "text-rose-300", "bg-rose-300", "4%"],
    ["49", 49, null, "49", "text-rose-300", "bg-rose-300", "49%"],
    ["50", 50, null, "50", "text-amber-300", "bg-amber-300", "50%"],
    ["79", 79, null, "79", "text-amber-300", "bg-amber-300", "79%"],
    ["80", 80, null, "80", "text-emerald-300", "bg-emerald-300", "80%"],
    [
      "degraded high",
      95,
      "degraded",
      "95",
      "text-emerald-300",
      "bg-emerald-300",
      "95%",
    ],
    [
      "unhealthy high",
      90,
      "unhealthy",
      "90",
      "text-emerald-300",
      "bg-emerald-300",
      "90%",
    ],
    [
      "healthy low",
      2,
      "healthy",
      "2",
      "text-emerald-300",
      "bg-emerald-300",
      "4%",
    ],
  ] as const)(
    "preserves ordered score/status precedence for %s",
    (_name, score, status, text, textClass, barClass, width) => {
      const rendered = renderHealthScore({ score, status });

      expect(rendered.text).toHaveTextContent(text);
      expect(rendered.text).toHaveClass(
        "text-lg",
        "font-extrabold",
        textClass,
      );
      expect(rendered.bar).toHaveClass("h-full", "rounded-full", barClass);
      expect(rendered.bar).toHaveStyle({ width });
    },
  );

  it.each([
    [null, "0%"],
    [0, "4%"],
    [1, "4%"],
    [3, "4%"],
    [4, "4%"],
    [5, "5%"],
  ] as const)("preserves the minimum width for score %s", (score, width) => {
    const { bar } = renderHealthScore({ score, status: null });

    expect(bar).toHaveStyle({ width });
  });
});

describe("HealthScore layout variants", () => {
  it("preserves the exact compact layout and classes", () => {
    const { bar, layout, root, track } = renderHealthScore({
      compact: true,
      score: 88,
      status: "healthy",
    });

    expect(root).toHaveAttribute("class", "min-w-0");
    expect(layout).toHaveAttribute(
      "class",
      "flex min-w-0 items-center gap-2",
    );
    expect(track).toHaveAttribute(
      "class",
      "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-700/70",
    );
    expect(bar).toHaveAttribute(
      "class",
      "h-full rounded-full bg-emerald-300",
    );
  });

  it("preserves the exact regular layout and classes", () => {
    const { bar, layout, root, track } = renderHealthScore({
      score: 88,
      status: "healthy",
    });

    expect(root).toHaveAttribute("class", "min-w-28");
    expect(layout).toHaveAttribute("class", "flex items-center gap-3");
    expect(track).toHaveAttribute(
      "class",
      "h-1.5 w-24 overflow-hidden rounded-full bg-slate-700/70",
    );
    expect(bar).toHaveAttribute(
      "class",
      "h-full rounded-full bg-emerald-300",
    );
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/shared/components/StatusBadge";

describe("frontend test harness", () => {
  it("renders React components imported through the production alias", () => {
    render(<StatusBadge status="healthy" text="Harness ready" />);

    expect(screen.getByText("Harness ready")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import type { RouteObject } from "react-router-dom";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/ConsoleLayout", async () => {
  const { Outlet } = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ConsoleLayout: () => <Outlet />,
  };
});

vi.mock("@/pages/DashboardPage", () => ({
  DashboardPage: () => <main aria-label="Dashboard page boundary" />,
}));

vi.mock("@/pages/SymbolDetailPage", () => ({
  SymbolDetailPage: () => <main aria-label="Symbol detail page boundary" />,
}));

vi.mock("@/pages/AnomaliesPage", () => ({
  AnomaliesPage: () => <main aria-label="Anomalies page boundary" />,
}));

import { appRoutes } from "@/app/router";

const REQUIRED_ROUTE_PATHS = [
  "/",
  "/anomalies",
  "/dashboard",
  "/symbols/:symbol",
] as const;

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [path],
  });

  return render(<RouterProvider router={router} />);
}

function registeredPagePaths(routes: RouteObject[]): string[] {
  const rootRoute = routes.find((route) => route.path === "/");

  return (rootRoute?.children ?? [])
    .flatMap((route) => {
      if (route.index) {
        return ["/"];
      }

      return route.path ? [`/${route.path}`] : [];
    })
    .sort();
}

describe("dashboard route inventory", () => {
  it("keeps every required page route registered", () => {
    expect(registeredPagePaths(appRoutes)).toEqual([...REQUIRED_ROUTE_PATHS].sort());
  });

  it.each(["/", "/dashboard"])(
    "renders the dashboard page boundary for %s",
    (path) => {
      renderPath(path);

      expect(
        screen.getByRole("main", { name: "Dashboard page boundary" }),
      ).toBeInTheDocument();
    },
  );

  it("renders the symbol detail page boundary for a concrete symbol", () => {
    renderPath("/symbols/BTCUSDT");

    expect(
      screen.getByRole("main", { name: "Symbol detail page boundary" }),
    ).toBeInTheDocument();
  });

  it("renders the anomalies page boundary", () => {
    renderPath("/anomalies");

    expect(
      screen.getByRole("main", { name: "Anomalies page boundary" }),
    ).toBeInTheDocument();
  });

  it("documents the current gap: no explicit unknown-route boundary is registered", () => {
    const rootRoute = appRoutes.find((route) => route.path === "/");
    const hasExplicitUnknownRoute = rootRoute?.children?.some(
      (route) => route.path === "*",
    );

    expect(hasExplicitUnknownRoute).toBe(false);
  });
});

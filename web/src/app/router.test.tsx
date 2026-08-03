import { render, screen, waitFor } from "@testing-library/react";
import type { RouteObject } from "react-router-dom";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/ConsoleLayout", async () => {
  const { Outlet } = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return { ConsoleLayout: () => <Outlet /> };
});

vi.mock("@/pages/DashboardPage", () => ({
  DashboardPage: () => <main aria-label="Dashboard page boundary" />,
}));

import { appRoutes } from "@/app/router";

function renderPath(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

function registeredPaths(routes: RouteObject[]): string[] {
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

describe("modal-only route inventory", () => {
  it("keeps Dashboard as the only visual page while retaining compatibility paths", () => {
    expect(registeredPaths(appRoutes)).toEqual([
      "/",
      "/anomalies",
      "/dashboard",
      "/symbols/:symbol",
    ]);

    const children = appRoutes[0]?.children ?? [];
    const visualRoutes = children.filter(
      (route) => route.index || route.path === "dashboard",
    );
    const compatibilityRoutes = children.filter(
      (route) => route.path === "symbols/:symbol" || route.path === "anomalies",
    );

    expect(visualRoutes).toHaveLength(2);
    expect(compatibilityRoutes).toHaveLength(2);
    for (const route of compatibilityRoutes) {
      expect(route.element?.type).toBe(Navigate);
      expect(route.element?.props).toMatchObject({ replace: true, to: "/dashboard" });
    }
  });

  it.each(["/", "/dashboard"])("renders Dashboard for %s", (path) => {
    renderPath(path);
    expect(
      screen.getByRole("main", { name: "Dashboard page boundary" }),
    ).toBeInTheDocument();
  });

  it.each([
    "/symbols/BTCUSDT",
    "/symbols/ETHUSDT",
    "/symbols/bTcUsDt",
    "/anomalies",
  ])("replacement-redirects %s directly to Dashboard", async (path) => {
    const router = renderPath(path);

    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
    expect(router.state.historyAction).toBe("REPLACE");
    expect(
      screen.getByRole("main", { name: "Dashboard page boundary" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/placeholder page/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sample symbol/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("does not add an unknown-route visual boundary", () => {
    const rootRoute = appRoutes.find((route) => route.path === "/");
    expect(rootRoute?.children?.some((route) => route.path === "*")).toBe(false);
  });
});

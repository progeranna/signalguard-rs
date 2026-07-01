import { createBrowserRouter, Outlet } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { AnomaliesPage } from "@/pages/AnomaliesPage";
import { ArchitecturePage } from "@/pages/ArchitecturePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { SymbolDetailPage } from "@/pages/SymbolDetailPage";

function ConsoleLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ConsoleLayout />,
    children: [
      {
        index: true,
        element: <LandingPage />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "symbols/:symbol",
        element: <SymbolDetailPage />,
      },
      {
        path: "anomalies",
        element: <AnomaliesPage />,
      },
      {
        path: "architecture",
        element: <ArchitecturePage />,
      },
    ],
  },
]);

import { createBrowserRouter } from "react-router-dom";

import { ConsoleLayout } from "@/app/ConsoleLayout";
import { AnomaliesPage } from "@/pages/AnomaliesPage";
import { ArchitecturePage } from "@/pages/ArchitecturePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { LandingPage } from "@/pages/LandingPage";
import { SymbolDetailPage } from "@/pages/SymbolDetailPage";

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

import { createBrowserRouter } from "react-router-dom";

import { CanonicalSymbolRoute } from "@/app/CanonicalSymbolRoute";
import { ConsoleLayout } from "@/app/ConsoleLayout";
import { AnomaliesPage } from "@/pages/AnomaliesPage";
import { DashboardPage } from "@/pages/DashboardPage";

export const appRoutes = [
  {
    path: "/",
    element: <ConsoleLayout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "symbols/:symbol",
        element: <CanonicalSymbolRoute />,
      },
      {
        path: "anomalies",
        element: <AnomaliesPage />,
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);

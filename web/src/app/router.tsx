import { createBrowserRouter } from "react-router-dom";

import { ConsoleLayout } from "@/app/ConsoleLayout";
import { AnomaliesPage } from "@/pages/AnomaliesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { SymbolDetailPage } from "@/pages/SymbolDetailPage";

export const router = createBrowserRouter([
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
        element: <SymbolDetailPage />,
      },
      {
        path: "anomalies",
        element: <AnomaliesPage />,
      },
    ],
  },
]);

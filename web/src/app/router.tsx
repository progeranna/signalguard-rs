import { createBrowserRouter, Navigate } from "react-router-dom";

import { ConsoleLayout } from "@/app/ConsoleLayout";
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
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "anomalies",
        element: <Navigate to="/dashboard" replace />,
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);

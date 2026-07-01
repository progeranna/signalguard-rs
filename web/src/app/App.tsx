import { AppProviders } from "@/app/providers";
import { router } from "@/app/router";
import { RouterProvider } from "react-router-dom";

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}

import { Outlet } from "react-router-dom";

import { AppShell } from "@/app/AppShell";

export function ConsoleLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { dashboardSummaryQueryKeyForMode } from "@/features/dashboard/api";
import { selectedSymbolStorageKey } from "@/features/dashboard/selectedSymbol";
import { matrixSummary } from "@/test/marketFixtures";

vi.mock("@/app/GlobalMarketTicker", () => ({
  GlobalMarketTicker: () => null,
}));

const queryClients: QueryClient[] = [];

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  queryClients.splice(0).forEach((client) => client.clear());
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

function renderDashboard(path: "/" | "/dashboard") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  queryClients.push(queryClient);
  queryClient.setQueryData(
    dashboardSummaryQueryKeyForMode("demo"),
    matrixSummary("demo"),
  );
  queryClient.setQueryData(
    dashboardSummaryQueryKeyForMode("live"),
    matrixSummary("live"),
  );

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <AppShell>
          <section aria-label="Dashboard content" />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function selectHeaderSymbol(symbol: string) {
  fireEvent.click(screen.getByRole("button", { name: /^BTCUSDT/ }));
  fireEvent.click(screen.getByRole("menuitemradio", { name: symbol }));
}

describe("modal-only header market identity", () => {
  it.each(["/", "/dashboard"] as const)(
    "changes the Dashboard selection without navigating from %s",
    async (path) => {
      renderDashboard(path);

      selectHeaderSymbol("ETHUSDT");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: /^ETHUSDT/ })).toBeInTheDocument(),
      );
      expect(screen.getByTestId("location")).toHaveTextContent(path);
      expect(screen.getByTestId("location").textContent).not.toContain("/symbols/");
      expect(window.localStorage.getItem(selectedSymbolStorageKey("demo")))
        .toBe("ETHUSDT");
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(screen.queryByText(/market is not in the current summary/i))
        .not.toBeInTheDocument();
    },
  );

  it("keeps Demo and Live selections isolated while preserving the Dashboard pathname", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "BTCUSDT");
    renderDashboard("/dashboard");

    selectHeaderSymbol("ETHUSDT");
    fireEvent.click(screen.getByRole("button", { name: /Demo Mode/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Live Mode/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^BTCUSDT/ })).toBeInTheDocument(),
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard?mode=live",
    );
    expect(window.localStorage.getItem(selectedSymbolStorageKey("demo")))
      .toBe("ETHUSDT");
    expect(window.localStorage.getItem(selectedSymbolStorageKey("live")))
      .toBe("BTCUSDT");
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});

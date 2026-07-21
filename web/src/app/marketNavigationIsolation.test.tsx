import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type NavigateFunction,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";
import { CanonicalSymbolRoute } from "./CanonicalSymbolRoute";
import {
  dashboardSummaryQueryKeyForMode,
  runtimeModeQueryKey,
} from "@/features/dashboard/api";
import { selectedSymbolStorageKey } from "@/features/dashboard/selectedSymbol";
import {
  matrixRuntimeMode,
  matrixSentinel,
  matrixSummary,
} from "@/test/marketFixtures";

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

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: Infinity,
      },
    },
  });
  queryClients.push(client);
  return client;
}

function NavigationProbe({
  navigateRef,
}: {
  navigateRef: { current: NavigateFunction | null };
}) {
  const navigate = useNavigate();
  const location = useLocation();

  navigateRef.current = navigate;

  return (
    <span data-testid="pathname" hidden>
      {location.pathname}
    </span>
  );
}

function renderRoute(
  initialEntry: string,
  {
    demoSummary = matrixSummary("demo"),
    liveSummary = matrixSummary("live"),
    liveSymbols = ["BTCUSDT", "ETHUSDT"],
  }: {
    demoSummary?: ReturnType<typeof matrixSummary>;
    liveSummary?: ReturnType<typeof matrixSummary>;
    liveSymbols?: string[];
  } = {},
) {
  const queryClient = createQueryClient();
  const navigateRef: { current: NavigateFunction | null } = { current: null };
  queryClient.setQueryData(
    dashboardSummaryQueryKeyForMode("demo"),
    demoSummary,
  );
  queryClient.setQueryData(
    dashboardSummaryQueryKeyForMode("live"),
    liveSummary,
  );
  queryClient.setQueryData(runtimeModeQueryKey, matrixRuntimeMode(liveSymbols));

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <NavigationProbe navigateRef={navigateRef} />
        <Routes>
          <Route
            path="/"
            element={
              <AppShell>
                <Outlet />
              </AppShell>
            }
          >
            <Route path="symbols/:symbol" element={<CanonicalSymbolRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    navigate: async (to: string) => {
      await waitFor(() => expect(navigateRef.current).not.toBeNull());
      await act(async () => {
        navigateRef.current?.(to);
      });
    },
    queryClient,
  };
}

function expectHeaderSymbol(symbol: string) {
  expect(
    screen.getByRole("button", { name: new RegExp(`^${symbol}`) }),
  ).toBeInTheDocument();
}

describe("route and header market identity", () => {
  it("route BTC → route ETH updates canonical heading, header, detail data, and per-mode storage", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("demo"), "BTCUSDT");
    const { navigate } = renderRoute("/symbols/BTCUSDT?mode=demo");

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "BTCUSDT" }))
        .toBeInTheDocument(),
    );
    await waitFor(() => expectHeaderSymbol("BTCUSDT"));
    expect(screen.getAllByText(matrixSentinel("demo", "BTCUSDT").anomaly).length)
      .toBeGreaterThan(0);

    await navigate("/symbols/ETHUSDT?mode=demo");

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "ETHUSDT" }))
        .toBeInTheDocument(),
    );
    await waitFor(() => expectHeaderSymbol("ETHUSDT"));
    expect(screen.getAllByText(matrixSentinel("demo", "ETHUSDT").anomaly).length)
      .toBeGreaterThan(0);
    expect(screen.queryByText(matrixSentinel("demo", "BTCUSDT").anomaly))
      .not.toBeInTheDocument();
    expect(window.localStorage.getItem(selectedSymbolStorageKey("demo")))
      .toBe("ETHUSDT");
  });

  it("normalizes a mixed-case symbol route before detail and header ownership", async () => {
    renderRoute("/symbols/bTcUsDt?mode=demo");

    await waitFor(() =>
      expect(screen.getByTestId("pathname")).toHaveTextContent(
        "/symbols/BTCUSDT",
      ),
    );
    expect(screen.getByRole("heading", { level: 1, name: "BTCUSDT" }))
      .toBeInTheDocument();
    await waitFor(() => expectHeaderSymbol("BTCUSDT"));
    expect(screen.queryByRole("heading", { level: 1, name: "bTcUsDt" }))
      .not.toBeInTheDocument();
  });

  it("an invalid or absent Live route symbol remains explicit and never fabricates a Demo fallback", async () => {
    window.localStorage.setItem(selectedSymbolStorageKey("live"), "ETHUSDT");
    renderRoute("/symbols/DOGE-USDT?mode=live", {
      liveSummary: matrixSummary("live", ["ETHUSDT"]),
      liveSymbols: ["ETHUSDT"],
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "DOGE-USDT" }))
        .toBeInTheDocument(),
    );
    expectHeaderSymbol("Unknown market");
    expect(
      screen.getByText("DOGE-USDT market is not in the current summary"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ETHUSDT" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "BTCUSDT" })).not.toBeInTheDocument();
    expect(screen.queryByText(matrixSentinel("demo", "BTCUSDT").anomaly))
      .not.toBeInTheDocument();
    expect(screen.queryByText(matrixSentinel("demo", "ETHUSDT").anomaly))
      .not.toBeInTheDocument();
  });
});

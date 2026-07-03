import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  DEFAULT_UI_MODE,
  parseUiMode,
  type UiMode,
} from "./types";

export const UI_MODE_STORAGE_KEY = "signalguard:ui-mode";

export function resolveUiMode(
  locationSearch: string,
  storedMode: UiMode | null = getStoredUiMode(),
): UiMode {
  const modeFromUrl = parseUiMode(new URLSearchParams(locationSearch).get("mode"));

  return modeFromUrl ?? storedMode ?? DEFAULT_UI_MODE;
}

export function getStoredUiMode(): UiMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return parseUiMode(window.localStorage.getItem(UI_MODE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeUiMode(mode: UiMode): UiMode {
  if (typeof window === "undefined") {
    return mode;
  }

  try {
    window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
  } catch {
    return mode;
  }

  return mode;
}

export function buildModeSearch(locationSearch: string, mode: UiMode): string {
  const params = new URLSearchParams(locationSearch);
  params.set("mode", mode);

  const search = params.toString();

  return search ? `?${search}` : "";
}

export function useResolvedUiMode(): UiMode {
  const location = useLocation();

  return useMemo(() => resolveUiMode(location.search), [location.search]);
}

export function useUiModeController() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedUiMode = useResolvedUiMode();

  const setSelectedUiMode = useCallback(
    (nextMode: UiMode) => {
      const resolvedMode = storeUiMode(nextMode);
      navigate(
        {
          pathname: location.pathname,
          search: buildModeSearch(location.search, resolvedMode),
        },
        { replace: true },
      );

      return resolvedMode;
    },
    [location.pathname, location.search, navigate],
  );

  return { selectedUiMode, setSelectedUiMode };
}

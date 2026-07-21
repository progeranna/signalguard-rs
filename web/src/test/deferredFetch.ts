import type { UiMode } from "@/features/dashboard/types";

export type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

export type RequestEndpoint = "runtime" | "summary" | "timeline";

export type RequestIdentity = {
  endpoint: RequestEndpoint;
  mode?: UiMode;
  symbol?: string;
};

export type ControlledRequest = {
  deferred: Deferred<Response>;
  identity: RequestIdentity;
  signal: AbortSignal | undefined;
  url: string;
};

export type ControlledFetch = {
  fetchMock: ReturnType<typeof vi.fn>;
  find: (identity: RequestIdentity) => ControlledRequest | undefined;
  requests: ControlledRequest[];
  resolve: (identity: RequestIdentity, payload: unknown) => void;
};

import { vi } from "vitest";

export function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
}

export function installControlledFetch({
  rejectOnAbort = false,
}: {
  rejectOnAbort?: boolean;
} = {}): ControlledFetch {
  const requests: ControlledRequest[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const deferred = createDeferred<Response>();
    const signal = init?.signal ?? undefined;
    const request: ControlledRequest = {
      deferred,
      identity: parseRequestIdentity(url),
      signal,
      url,
    };
    requests.push(request);

    signal?.addEventListener(
      "abort",
      () => {
        if (rejectOnAbort) {
          const error = new Error("The request was aborted");
          error.name = "AbortError";
          deferred.reject(error);
        }
      },
      { once: true },
    );

    return deferred.promise;
  });

  vi.stubGlobal("fetch", fetchMock);

  function find(identity: RequestIdentity) {
    return requests.find((request) => identityMatches(request.identity, identity));
  }

  function resolve(identity: RequestIdentity, payload: unknown) {
    const request = find(identity);

    if (!request) {
      throw new Error(`request not found: ${formatIdentity(identity)}`);
    }

    request.deferred.resolve(createJsonResponse(payload));
  }

  return { fetchMock, find, requests, resolve };
}

export function requestIdentityKey(identity: RequestIdentity): string {
  return [identity.endpoint, identity.mode ?? "none", identity.symbol ?? "none"].join(":");
}

function parseRequestIdentity(value: string): RequestIdentity {
  const url = new URL(value, "http://signalguard.test");

  if (url.pathname.endsWith("/runtime/mode")) {
    return { endpoint: "runtime" };
  }

  const mode = parseMode(url.searchParams.get("mode"));

  if (url.pathname.endsWith("/dashboard/summary")) {
    return { endpoint: "summary", mode };
  }

  const timelineMatch = url.pathname.match(/\/market\/([^/]+)\/timeline$/);

  if (timelineMatch) {
    return {
      endpoint: "timeline",
      mode,
      symbol: decodeURIComponent(timelineMatch[1] ?? "").trim().toUpperCase(),
    };
  }

  throw new Error(`unexpected request URL: ${value}`);
}

function parseMode(value: string | null): UiMode | undefined {
  return value === "demo" || value === "live" ? value : undefined;
}

function identityMatches(actual: RequestIdentity, expected: RequestIdentity): boolean {
  return (
    actual.endpoint === expected.endpoint &&
    (expected.mode === undefined || actual.mode === expected.mode) &&
    (expected.symbol === undefined || actual.symbol === expected.symbol)
  );
}

function formatIdentity(identity: RequestIdentity): string {
  return requestIdentityKey(identity);
}

export function createJsonResponse(payload: unknown): Response {
  const body = JSON.stringify(payload);

  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    json: async () => JSON.parse(body),
    ok: true,
    status: 200,
    text: async () => body,
  } as Response;
}

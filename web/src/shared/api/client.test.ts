import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ApiValidationError } from "./errors";
import { fetchJson } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch() {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(payload: unknown, status = 200): Response {
  const body = JSON.stringify(payload);

  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    json: async () => JSON.parse(body),
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) {
    return null;
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
  }

  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name.toLowerCase());

  return key ? record[key] : null;
}

describe("fetchJson", () => {
  it("forwards the explicit signal and preserves request options", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const explicitSignal = new AbortController().signal;
    const initSignal = new AbortController().signal;

    await expect(
      fetchJson("/health", {
        schema: z.object({ ok: z.boolean() }),
        init: {
          credentials: "include",
          headers: { "X-Request-ID": "test-request" },
          method: "POST",
          signal: initSignal,
        },
        query: {
          empty: "",
          market: "BTCUSDT",
          page: 2,
          skipped: null,
        },
        signal: explicitSignal,
      }),
    ).resolves.toEqual({ ok: true });

    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/health?market=BTCUSDT&page=2");
    expect(requestInit).toMatchObject({
      credentials: "include",
      method: "POST",
      signal: explicitSignal,
    });
    expect(headerValue(requestInit.headers, "accept")).toBe("application/json");
    expect(headerValue(requestInit.headers, "x-request-id")).toBe("test-request");
  });

  it("uses init.signal when no explicit signal is provided", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const initSignal = new AbortController().signal;

    await fetchJson("/health", {
      schema: z.object({ ok: z.boolean() }),
      init: { signal: initSignal },
    });

    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(initSignal);
  });

  it("preserves abort identity instead of wrapping it as an API error", async () => {
    const abortError = new Error("The request was aborted");
    abortError.name = "AbortError";
    const fetchMock = mockFetch();
    fetchMock.mockRejectedValue(abortError);

    await expect(
      fetchJson("/health", { schema: z.object({ ok: z.boolean() }) }),
    ).rejects.toBe(abortError);
    await expect(
      fetchJson("/health", { schema: z.object({ ok: z.boolean() }) }),
    ).rejects.not.toBeInstanceOf(ApiError);
  });

  it("keeps successful schema validation unchanged", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse({ value: 42 }));

    await expect(
      fetchJson("/value", {
        schema: z.object({ value: z.number() }),
      }),
    ).resolves.toEqual({ value: 42 });
  });

  it("keeps schema validation errors unchanged", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(jsonResponse({ value: "invalid" }));

    await expect(
      fetchJson("/value", {
        schema: z.object({ value: z.number() }),
      }),
    ).rejects.toBeInstanceOf(ApiValidationError);
  });

  it("keeps HTTP API errors unchanged", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "unavailable", message: "service unavailable" }, 503),
    );

    const error = await fetchJson("/health", {
      schema: z.object({ ok: z.boolean() }),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "unavailable",
      message: "service unavailable",
      status: 503,
    });
  });

  it("keeps non-JSON response handling unchanged", async () => {
    const fetchMock = mockFetch();
    const body = "accepted";
    fetchMock.mockResolvedValue({
      headers: {
        get(name: string) {
          return name.toLowerCase() === "content-type" ? "text/plain" : null;
        },
      },
      json: async () => JSON.parse(body),
      ok: true,
      status: 200,
      text: async () => body,
    } as Response);

    await expect(
      fetchJson("/health", {
        schema: z.object({ message: z.string() }),
      }),
    ).resolves.toEqual({ message: "accepted" });
  });
});

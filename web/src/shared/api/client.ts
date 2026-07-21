import { z } from "zod";

import {
  ApiError,
  ApiValidationError,
  apiErrorResponseSchema,
} from "@/shared/api/errors";

const DEFAULT_API_BASE_URL = "/api";

type QueryValue = string | number | boolean | null | undefined;

type FetchJsonOptions<TSchema extends z.ZodTypeAny> = {
  schema: TSchema;
  init?: RequestInit;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
};

export function getApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_SIGNALGUARD_API_BASE_URL?.trim();

  if (!configuredBaseUrl) {
    return DEFAULT_API_BASE_URL;
  }

  return configuredBaseUrl.replace(/\/+$/, "");
}

export function buildApiUrl(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();

  const url = new URL(
    `${baseUrl.replace(/\/+$/, "")}${normalizedPath}`,
    window.location.origin,
  );

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export async function fetchJson<TSchema extends z.ZodTypeAny>(
  path: string,
  options: FetchJsonOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  const { schema, init, query, signal } = options;
  const response = await fetch(buildApiUrl(path, query), {
    ...init,
    signal: signal ?? init?.signal,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    throw buildApiError(response.status, payload);
  }

  return parseWithSchema(schema, payload, path);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

function buildApiError(status: number, payload: unknown): ApiError {
  const parsed = apiErrorResponseSchema.safeParse(payload);

  if (parsed.success) {
    return new ApiError({
      status,
      code: parsed.data.error,
      message: parsed.data.message,
      details: payload,
    });
  }

  return new ApiError({
    status,
    code: "http_error",
    message: `Request failed with status ${status}`,
    details: payload,
  });
}

export function parseWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  context: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new ApiValidationError(
      `Response validation failed for ${context}`,
      parsed.error,
    );
  }

  return parsed.data;
}

import { ZodError, z } from "zod";

export const apiErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor({
    status,
    code,
    message,
    details,
  }: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiValidationError extends Error {
  readonly details: ZodError;

  constructor(message: string, details: ZodError) {
    super(message);
    this.name = "ApiValidationError";
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isApiValidationError(error: unknown): error is ApiValidationError {
  return error instanceof ApiValidationError;
}

/**
 * Canonical error envelope helpers.
 *
 * Every route reports failures via `ApiError` instead of throwing
 * raw exceptions. The Fastify error handler converts an `ApiError`
 * into the `ErrorEnvelopeSchema` shape from `@cad/protocol`,
 * setting `i18nKey` so the web client re-translates in the active
 * locale (per Slice 0b's i18n contract).
 */

import type { ErrorEnvelope } from '@cad/protocol';

export interface ApiErrorOptions {
  /** Stable machine-parseable code, e.g. `'auth.invalid_credentials'`. */
  readonly code: string;
  /** English fallback message safe for logs and non-web clients. */
  readonly message: string;
  /** HTTP status code (4xx / 5xx). */
  readonly statusCode: number;
  /** Optional translation key the client re-translates per locale. */
  readonly i18nKey?: string;
  /** Optional structured details (e.g. Zod issues). */
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Application-level error carrying everything the canonical
 * envelope needs. Throw inside route handlers; the Fastify error
 * handler catches it and serialises the response.
 */
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly i18nKey: string | undefined;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.i18nKey = options.i18nKey;
    this.details = options.details;
  }
}

/**
 * Map an `ApiError` (or any unknown value) into the canonical
 * `ErrorEnvelope` shape. `requestId` is supplied by the Fastify
 * error handler from `request.id`.
 */
export function toErrorEnvelope(error: unknown, requestId?: string): ErrorEnvelope {
  if (error instanceof ApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.i18nKey === undefined ? {} : { i18nKey: error.i18nKey }),
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      ...(requestId === undefined ? {} : { requestId }),
    };
  }
  // Anything else is an unexpected internal failure. Never leak
  // raw error messages — they may carry stack frames or PII.
  return {
    error: {
      code: 'internal',
      message: 'An unexpected error occurred.',
      i18nKey: 'errors:generic',
    },
    ...(requestId === undefined ? {} : { requestId }),
  };
}

/** Convenience factory: 401 unauthorized. */
export function unauthorized(message = 'Authentication required.'): ApiError {
  return new ApiError({
    code: 'unauthorized',
    message,
    statusCode: 401,
    i18nKey: 'errors:auth.session_expired',
  });
}

/** Convenience factory: 401 invalid credentials. */
export function invalidCredentials(): ApiError {
  return new ApiError({
    code: 'auth.invalid_credentials',
    message: 'Email or password is incorrect.',
    statusCode: 401,
    i18nKey: 'errors:auth.invalid_credentials',
  });
}

/** Convenience factory: 404 not found. */
export function notFound(resource: 'project' | 'document', message?: string): ApiError {
  return new ApiError({
    code: `${resource}s.not_found`,
    message: message ?? `The requested ${resource} was not found.`,
    statusCode: 404,
    i18nKey: `errors:${resource}s.not_found`,
  });
}

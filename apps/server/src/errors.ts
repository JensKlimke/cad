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
 * Fastify-ish error shape: Fastify and `fastify-type-provider-zod`
 * decorate thrown errors with `statusCode` and (for Zod rejections)
 * a `validation` array. We look for both without importing the
 * plugin's concrete types, which would couple the error handler
 * to a transitive dependency.
 */
interface FastifyValidationError {
  readonly statusCode?: number;
  readonly validation?: readonly unknown[];
  readonly validationContext?: string;
  readonly message?: string;
}

function asFastifyError(error: unknown): FastifyValidationError | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  return error as FastifyValidationError;
}

/**
 * Resolve the HTTP status code to emit for a thrown error.
 *
 * - `ApiError` carries its own `statusCode`.
 * - Fastify's own errors (validation, 404, unsupported media) set
 *   `statusCode` on the error object; honour whatever Fastify
 *   derived.
 * - Everything else is treated as an internal 500.
 */
export function statusCodeFor(error: unknown): number {
  if (error instanceof ApiError) {
    return error.statusCode;
  }
  const fastifyError = asFastifyError(error);
  if (fastifyError?.statusCode !== undefined && fastifyError.statusCode >= 400) {
    return fastifyError.statusCode;
  }
  return 500;
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

  // Fastify validation errors (Zod params/body/querystring) arrive
  // with `error.validation` populated. Emit a stable envelope the
  // web client can re-translate via `errors:validation.failed`.
  const fastifyError = asFastifyError(error);
  if (fastifyError?.validation !== undefined) {
    return {
      error: {
        code: 'validation.failed',
        message: fastifyError.message ?? 'Request validation failed.',
        i18nKey: 'errors:validation.failed',
        details: {
          issues: fastifyError.validation as readonly unknown[],
          ...(fastifyError.validationContext === undefined
            ? {}
            : { context: fastifyError.validationContext }),
        },
      },
      ...(requestId === undefined ? {} : { requestId }),
    };
  }

  // Any other Fastify error that carries a 4xx statusCode (404
  // not-found, 415 unsupported-media, etc.) still deserves a
  // non-generic envelope so the client can distinguish it from
  // genuine internal failures.
  if (
    fastifyError?.statusCode !== undefined &&
    fastifyError.statusCode >= 400 &&
    fastifyError.statusCode < 500
  ) {
    return {
      error: {
        code: 'request.rejected',
        message: fastifyError.message ?? 'Request rejected.',
        i18nKey: 'errors:request.rejected',
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
export function notFound(
  resource: 'project' | 'document' | 'handbook_page',
  message?: string,
): ApiError {
  return new ApiError({
    code: `${resource}s.not_found`,
    message: message ?? `The requested ${resource} was not found.`,
    statusCode: 404,
    i18nKey: `errors:${resource}s.not_found`,
  });
}

export function buildFailed(
  message: string,
  statusCode = 422,
  details?: Readonly<Record<string, unknown>>,
): ApiError {
  return new ApiError({
    code: 'documents.build_failed',
    message,
    statusCode,
    i18nKey: 'errors:generic',
    ...(details === undefined ? {} : { details }),
  });
}

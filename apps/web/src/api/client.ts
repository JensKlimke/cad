/**
 * Typed `fetch` wrapper for the CAD REST API.
 *
 * Every request:
 *   - Sends + receives credentials so the `cad_session` cookie
 *     survives navigation.
 *   - Carries the active `cad_locale` cookie in `Accept-Language`
 *     so the server's i18n hook can translate error envelopes
 *     even when Slice 0b's cookie path isn't taken (belt and
 *     braces with the cookie-first server resolution).
 *   - Validates the response body against a `@cad/protocol` Zod
 *     schema before returning. Non-2xx responses are parsed into
 *     the canonical `ErrorEnvelopeSchema` and thrown as
 *     `ApiClientError` so every consumer can pattern-match on
 *     `error.envelope.error.code` / `i18nKey`.
 *
 * `VITE_API_BASE_URL` controls the prefix:
 *   - default `/api` — the docker-compose path where nginx proxies
 *     `/api/*` to the Fastify server
 *   - explicit `http://localhost:8080` for the Playwright dev path
 *     where the web app connects directly to the server
 */

import { ErrorEnvelopeSchema, type ErrorEnvelope } from '@cad/protocol';

import type { z } from 'zod';

const BASE_URL: string = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api';

const COOKIE_NAME = 'cad_locale';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly envelope: ErrorEnvelope;

  constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.envelope = envelope;
  }
}

export interface ApiFetchOptions<TResponse extends z.ZodType> {
  /** Zod schema for the success response body. */
  readonly schema: TResponse;
  /** HTTP method. Defaults to GET. */
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Optional JSON request body. */
  readonly body?: unknown;
  /** Optional querystring. */
  readonly query?: Record<string, string | number | undefined>;
  /** Abort signal forwarded to `fetch`. */
  readonly signal?: AbortSignal;
}

function readLocaleCookie(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const escaped = COOKIE_NAME.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const match = new RegExp(String.raw`(?:^|;\s*)` + escaped + '=([^;]+)', 'u').exec(
    document.cookie,
  );
  return match?.[1];
}

export function buildApiUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
  const rel = path.startsWith('/') ? path : `/${path}`;
  if (query === undefined) {
    return `${base}${rel}`;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs.length > 0 ? `${base}${rel}?${qs}` : `${base}${rel}`;
}

/**
 * Typed `fetch` wrapper. Throws `ApiClientError` on non-2xx
 * responses and `Error` on schema mismatches.
 */
export async function apiFetch<TResponse extends z.ZodType>(
  path: string,
  options: ApiFetchOptions<TResponse>,
): Promise<z.infer<TResponse>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const locale = readLocaleCookie();
  if (locale !== undefined) {
    headers['Accept-Language'] = locale;
  }

  const response = await fetch(buildApiUrl(path, options.query), {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });

  if (response.status === 204) {
    // No-content responses still need to satisfy the schema.
    // Schemas for 204 endpoints declare `z.null()`.
    return options.schema.parse(null) as z.infer<TResponse>;
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    throw new Error(`apiFetch: failed to parse JSON response from ${path}`);
  }

  if (!response.ok) {
    const envelopeResult = ErrorEnvelopeSchema.safeParse(parsed);
    if (envelopeResult.success) {
      throw new ApiClientError(response.status, envelopeResult.data);
    }
    throw new ApiClientError(response.status, {
      error: {
        code: 'unknown',
        message: `Request failed with status ${response.status}`,
      },
    });
  }

  return options.schema.parse(parsed) as z.infer<TResponse>;
}

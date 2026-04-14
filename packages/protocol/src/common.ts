/**
 * Shared primitives for `@cad/protocol` request and response schemas.
 *
 * Every other module in this package builds on the schemas defined
 * here — IDs, timestamps, pagination, and the canonical error
 * envelope. Server, web client, MCP tools, and the CLI all share
 * these definitions; there is no parallel "API types" file
 * anywhere else in the monorepo.
 */

import { z } from 'zod';

/**
 * ULID — Crockford base32, 26 characters, lexicographically sortable.
 * Generated client-side via `@cad/db/src/ids.ts`.
 */
export const UlidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u, 'expected a 26-character Crockford base32 ULID');
export type Ulid = z.infer<typeof UlidSchema>;

/** ISO-8601 timestamp string with timezone offset. */
export const TimestampSchema = z.iso.datetime({ offset: true });
export type Timestamp = z.infer<typeof TimestampSchema>;

/**
 * Cursor-based pagination query parameters.
 *
 * Cursor pagination uses `(created_at, id)` ordering on the server
 * to avoid duplicate rows when timestamps tie. The `cursor` value is
 * the last seen ULID; servers return `nextCursor: undefined` when
 * the page is the final page.
 */
export const PageParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: UlidSchema.optional(),
});
export type PageParams = z.infer<typeof PageParamsSchema>;

/**
 * Canonical error envelope returned by every REST endpoint.
 *
 * - `code` is a stable machine-parseable identifier
 *   (e.g. `'unauthorized'`, `'validation.failed'`,
 *   `'projects.not_found'`).
 * - `message` is an English fallback safe for logs and non-web
 *   callers.
 * - `i18nKey` is the optional translation key the web client
 *   re-translates in the active locale (e.g.
 *   `'errors:auth.invalid_credentials'`). The Slice 0b i18n contract
 *   establishes this field; Slice 1 is its first runtime consumer.
 *   Unset for generic / infrastructure errors.
 * - `details` carries optional structured context (Zod issues, etc.).
 * - `requestId` echoes the server-generated correlation id so log
 *   lines and client errors can be cross-referenced.
 */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    i18nKey: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  requestId: z.string().optional(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/** Email schema reused by every auth-touching surface. */
export const EmailSchema = z.email().max(320);
export type Email = z.infer<typeof EmailSchema>;

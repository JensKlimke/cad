/**
 * ULID identifier helpers.
 *
 * Every primary key in `@cad/db` is a 26-character Crockford base32
 * ULID generated client-side. ULIDs are lexicographically sortable
 * by creation timestamp, which means `(created_at, id)` cursor
 * pagination collapses to a single-column index scan and tie-breaks
 * deterministically when timestamps collide.
 *
 * The `Ulid` type is a branded string so a raw `string` cannot be
 * assigned where a ULID is expected without an explicit `ulid()` /
 * `parseUlid()` round-trip.
 */

import { ulid as generateUlid } from 'ulid';

declare const ulidBrand: unique symbol;

/**
 * Branded string type for ULID values. A `Ulid` is structurally
 * still a string, but TypeScript treats it as nominally distinct so
 * accidental `string → Ulid` assignments fail at compile time.
 */
export type Ulid = string & { readonly [ulidBrand]: 'Ulid' };

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/** Generate a fresh ULID for the current millisecond. */
export function ulid(): Ulid {
  return generateUlid() as Ulid;
}

/**
 * Type guard for ULID-shaped strings. Accepts the same alphabet as
 * `@cad/protocol`'s `UlidSchema` — Crockford base32, uppercase, 26
 * characters, no I/L/O/U.
 */
export function isUlid(value: unknown): value is Ulid {
  return typeof value === 'string' && ULID_PATTERN.test(value);
}

/**
 * Parse an arbitrary string into a `Ulid`, throwing on malformed
 * input. Use at trust boundaries (DB row → typed object).
 */
export function parseUlid(value: string): Ulid {
  if (!isUlid(value)) {
    throw new TypeError(`expected a ULID, got ${JSON.stringify(value)}`);
  }
  return value;
}

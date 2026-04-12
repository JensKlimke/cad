/**
 * Deterministic tessellation hash.
 *
 * Floating-point geometry is fragile to hash directly: the same OCCT output
 * can drift by ±1 ULP across machines or kernel versions. We canonicalize
 * each float to an int32 at 1e-6 precision before hashing, which yields a
 * bit-identical digest on every platform for any two tessellations that
 * represent the same geometry at micron precision.
 *
 * The hash is used as:
 * - the cache key for memoized feature evaluation in `packages/runtime`
 * - the assertion target in Playwright's Slice 0 golden journey (`box-renders`)
 * - the mutation-testing target for Stryker in Slice 0 (first mutation suite)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

import type { TessellationResult } from './types.js';

/** Rounding denominator: six decimal places (micrometre precision). */
const PRECISION = 1_000_000;

/**
 * Round each float to `PRECISION` ticks and repack as int32. The resulting
 * buffer is byte-identical across any two inputs whose floats agree at 1e-6
 * resolution, regardless of platform.
 */
function canonicalizeFloats(src: Float32Array): Int32Array {
  return Int32Array.from(src, (value) => Math.round(value * PRECISION));
}

/** View a typed array's underlying buffer as raw bytes for hashing. */
function asBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Compute the deterministic SHA-256 hex digest of a {@link TessellationResult}.
 *
 * Stable across:
 * - repeated calls on the same inputs (pure function)
 * - float noise below 1e-6 (canonicalization absorbs it)
 * - Node vs browser (`@noble/hashes` is pure TS, no platform branching)
 *
 * Sensitive to:
 * - any geometric change ≥ 1e-6 in any position or normal component
 * - any change in triangle connectivity (indices)
 */
export function tessellationHash(result: TessellationResult): string {
  const hasher = sha256.create();
  hasher.update(asBytes(canonicalizeFloats(result.positions)));
  hasher.update(asBytes(canonicalizeFloats(result.normals)));
  hasher.update(asBytes(result.indices));
  return bytesToHex(hasher.digest());
}

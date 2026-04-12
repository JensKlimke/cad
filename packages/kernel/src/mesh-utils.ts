/**
 * Pure helpers for packing a replicad mesh into a {@link TessellationResult}.
 *
 * Extracted from `tessellate.ts` so the conversion logic can be unit-tested
 * without booting OCCT. None of these touch global state; all inputs and
 * outputs are plain typed-array views.
 */

import type { BoundingBox } from './types.js';

/**
 * Coerce an `ArrayLike<number>` to a `Float32Array`, reusing the input
 * unchanged when it already has that type.
 */
export function toFloat32(source: ArrayLike<number>): Float32Array {
  if (source instanceof Float32Array) {
    return source;
  }
  return Float32Array.from(source);
}

/**
 * Coerce an `ArrayLike<number>` to a `Uint32Array`, reusing the input
 * unchanged when it already has that type.
 */
export function toUint32(source: ArrayLike<number>): Uint32Array {
  if (source instanceof Uint32Array) {
    return source;
  }
  return Uint32Array.from(source);
}

/**
 * Axis-aligned bounding box of a flat `[x0, y0, z0, x1, y1, z1, ...]`
 * positions buffer. Returns a zero box for empty input.
 */
export function computeBBox(positions: Float32Array): BoundingBox {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] as number;
    const y = positions[i + 1] as number;
    const z = positions[i + 2] as number;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

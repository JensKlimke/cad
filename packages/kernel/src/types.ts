/**
 * Public type surface for `@cad/kernel`.
 *
 * Every type is `readonly` — kernel output is immutable by contract so
 * downstream layers (runtime cache, SDK, REST responses) can safely share
 * references without defensive copies.
 */

/** User input accepted by {@link createBox}. Positive, finite millimetres. */
export interface BoxInput {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Axis-aligned bounding box. */
export interface BoundingBox {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Summary info packed alongside the tessellation buffers. */
export interface TessellationMetadata {
  /** Deterministic SHA-256 hex digest of the canonicalized mesh. */
  readonly hash: string;
  /** Number of triangles in the mesh (== `indices.length / 3`). */
  readonly triangleCount: number;
  /** Number of vertices in the mesh (== `positions.length / 3`). */
  readonly vertexCount: number;
  /** Axis-aligned bounding box computed from the positions buffer. */
  readonly bbox: BoundingBox;
}

/**
 * Packed tessellation output. Suitable for direct upload to a Three.js
 * `BufferGeometry` (positions, normals, indices map one-to-one to
 * `setAttribute`/`setIndex`).
 */
export interface TessellationResult {
  /** Flat `[x0, y0, z0, x1, y1, z1, ...]` vertex positions. */
  readonly positions: Float32Array;
  /** Flat `[nx0, ny0, nz0, nx1, ny1, nz1, ...]` per-vertex normals. */
  readonly normals: Float32Array;
  /** Triangle indices into `positions` / `normals`. */
  readonly indices: Uint32Array;
  /** Summary metadata. */
  readonly metadata: TessellationMetadata;
}

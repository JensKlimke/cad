/**
 * Tessellate a parametric box into a `TessellationResult`.
 *
 * This is the minimum feature surface for Slice 0 — a single primitive —
 * exercised end-to-end by:
 * - `test/tessellate.int.test.ts` (real OCCT boot in Node)
 * - W8's apps/web Web Worker (real OCCT in the browser)
 * - W12's Playwright golden journey (asserts `metadata.hash`)
 *
 * Later slices replace this with a real SDK that composes features through
 * the authoring layer; this function is intentionally narrow.
 */

import { makeBaseBox } from 'replicad';
import { z } from 'zod';

import { tessellationHash } from './hash.js';
import { computeBBox, toFloat32, toUint32 } from './mesh-utils.js';
import { initOCCT } from './occt.js';

import type { TessellationResult } from './types.js';

const boxInputSchema = z
  .object({
    width: z.number().positive().finite(),
    depth: z.number().positive().finite(),
    height: z.number().positive().finite(),
  })
  .strict();

/** Linear meshing tolerance in millimetres. Tight enough for visual fidelity. */
const MESH_TOLERANCE = 0.1;

/** Angular meshing tolerance in radians (~28°). Balances triangle count vs curvature fidelity. */
const MESH_ANGULAR_TOLERANCE = 0.5;

/**
 * Shape of the mesh object replicad returns from `.mesh()`.
 *
 * Declared locally rather than imported because replicad's public type
 * surface does not re-export the mesh shape directly. The three typed arrays
 * are the contract we consume.
 */
interface ReplicadMesh {
  readonly vertices: ArrayLike<number>;
  readonly normals: ArrayLike<number>;
  readonly triangles: ArrayLike<number>;
}

/**
 * Create a solid box of the given dimensions and return its tessellated
 * representation. Units are millimetres.
 *
 * @throws {z.ZodError} if `input` is not a valid {@link BoxInput}
 */
export async function createBox(input: unknown): Promise<TessellationResult> {
  const { width, depth, height } = boxInputSchema.parse(input);
  await initOCCT();
  const solid = makeBaseBox(width, depth, height);
  try {
    const mesh = solid.mesh({
      tolerance: MESH_TOLERANCE,
      angularTolerance: MESH_ANGULAR_TOLERANCE,
    }) as unknown as ReplicadMesh;
    return packMesh(mesh);
  } finally {
    // Release the underlying OCCT handle so the WASM heap stays bounded.
    const disposable = solid as unknown as { delete?: () => void };
    disposable.delete?.();
  }
}

function packMesh(mesh: ReplicadMesh): TessellationResult {
  const positions = toFloat32(mesh.vertices);
  const normals = toFloat32(mesh.normals);
  const indices = toUint32(mesh.triangles);

  const bbox = computeBBox(positions);
  const vertexCount = positions.length / 3;
  const triangleCount = indices.length / 3;

  const result = {
    positions,
    normals,
    indices,
    metadata: {
      hash: '',
      triangleCount,
      vertexCount,
      bbox,
    },
  };

  // Hash is computed after the result is assembled — it's a function of
  // positions/normals/indices only, so the placeholder `metadata.hash`
  // above is deliberately ignored by `tessellationHash`.
  const metadata = { ...result.metadata, hash: tessellationHash(result) };
  return { ...result, metadata };
}

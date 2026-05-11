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

import { makeBaseBox, Sketcher } from 'replicad';
import { z } from 'zod';

import { tessellationHash } from './hash.js';
import { computeBBox, toFloat32, toUint32 } from './mesh-utils.js';
import { initOCCT } from './occt.js';

import type { RectanglePadInput, TessellationResult } from './types.js';

const boxInputSchema = z
  .object({
    width: z.number().positive().finite(),
    depth: z.number().positive().finite(),
    height: z.number().positive().finite(),
  })
  .strict();

const rectanglePadInputSchema = z
  .object({
    plane: z.enum(['xy', 'yz', 'xz']),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
    length: z.number().positive().finite(),
    direction: z.enum(['up', 'down', 'symmetric']),
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

export async function createPadFromRectangleSketch(
  input: RectanglePadInput,
): Promise<TessellationResult> {
  const rectangle = rectanglePadInputSchema.parse(input);
  await initOCCT();
  const { solid } = buildRectanglePad(rectangle);
  try {
    const mesh = solid.mesh({
      tolerance: MESH_TOLERANCE,
      angularTolerance: MESH_ANGULAR_TOLERANCE,
    }) as unknown as ReplicadMesh;
    return packMesh(mesh);
  } finally {
    safeDelete(solid);
  }
}

export function tessellationToStl(tessellation: TessellationResult): Uint8Array {
  const triangleCount = tessellation.indices.length / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);

  let offset = 84;
  for (let triangleIndex = 0; triangleIndex < tessellation.indices.length; triangleIndex += 3) {
    const a = tessellation.indices[triangleIndex];
    const b = tessellation.indices[triangleIndex + 1];
    const c = tessellation.indices[triangleIndex + 2];
    if (a === undefined || b === undefined || c === undefined) {
      continue;
    }
    const normal = faceNormal(tessellation.positions, a, b, c);
    offset = writeVec3(view, offset, normal);
    offset = writeIndexedVertex(view, offset, tessellation.positions, a);
    offset = writeIndexedVertex(view, offset, tessellation.positions, b);
    offset = writeIndexedVertex(view, offset, tessellation.positions, c);
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function buildRectanglePad(input: RectanglePadInput): {
  readonly solid: {
    readonly mesh: (options: { tolerance: number; angularTolerance: number }) => unknown;
    readonly translate: (xDist: number, yDist: number, zDist: number) => unknown;
    readonly delete?: () => void;
  };
} {
  const normal = planeNormal(input.plane);
  const extrusionDirection =
    input.direction === 'down'
      ? (normal.map((value) => -value) as [number, number, number])
      : normal;
  const sketch = new Sketcher(input.plane.toUpperCase() as 'XY' | 'YZ' | 'XZ')
    .movePointerTo([input.x, input.y])
    .hLine(input.width)
    .vLine(input.height)
    .hLine(-input.width);
  const closed = sketch.close() as unknown as {
    readonly delete?: () => void;
    extrude: (distance: number, config?: unknown) => unknown;
  };
  const extruded = closed.extrude(input.length, { extrusionDirection }) as unknown as {
    readonly translate: (xDist: number, yDist: number, zDist: number) => unknown;
    readonly mesh: (options: { tolerance: number; angularTolerance: number }) => unknown;
    readonly delete?: () => void;
  };
  if (input.direction !== 'symmetric') {
    return { solid: extruded };
  }
  return {
    solid: extruded.translate(
      (-normal[0] * input.length) / 2,
      (-normal[1] * input.length) / 2,
      (-normal[2] * input.length) / 2,
    ) as unknown as {
      readonly translate: (xDist: number, yDist: number, zDist: number) => unknown;
      readonly mesh: (options: { tolerance: number; angularTolerance: number }) => unknown;
      readonly delete?: () => void;
    },
  };
}

function safeDelete(target: { readonly delete?: () => void }): void {
  try {
    target.delete?.();
  } catch {
    // Replicad/OCCT ownership is not uniform across shapes; double-deletes
    // can surface for derived handles. Ignore teardown failures after meshing.
  }
}

function planeNormal(plane: RectanglePadInput['plane']): [number, number, number] {
  switch (plane) {
    case 'xy': {
      return [0, 0, 1];
    }
    case 'yz': {
      return [1, 0, 0];
    }
    case 'xz': {
      return [0, 1, 0];
    }
  }
}

function faceNormal(
  positions: Float32Array,
  a: number,
  b: number,
  c: number,
): readonly [number, number, number] {
  const ax = positions[a * 3] ?? 0;
  const ay = positions[a * 3 + 1] ?? 0;
  const az = positions[a * 3 + 2] ?? 0;
  const bx = positions[b * 3] ?? 0;
  const by = positions[b * 3 + 1] ?? 0;
  const bz = positions[b * 3 + 2] ?? 0;
  const cx = positions[c * 3] ?? 0;
  const cy = positions[c * 3 + 1] ?? 0;
  const cz = positions[c * 3 + 2] ?? 0;

  const ux = bx - ax;
  const uy = by - ay;
  const uz = bz - az;
  const vx = cx - ax;
  const vy = cy - ay;
  const vz = cz - az;
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (length === 0) {
    return [0, 0, 1];
  }
  return [nx / length, ny / length, nz / length];
}

function writeIndexedVertex(
  view: DataView,
  offset: number,
  positions: Float32Array,
  index: number,
): number {
  return writeVec3(view, offset, [
    positions[index * 3] ?? 0,
    positions[index * 3 + 1] ?? 0,
    positions[index * 3 + 2] ?? 0,
  ]);
}

function writeVec3(
  view: DataView,
  offset: number,
  vector: readonly [number, number, number],
): number {
  view.setFloat32(offset, vector[0], true);
  view.setFloat32(offset + 4, vector[1], true);
  view.setFloat32(offset + 8, vector[2], true);
  return offset + 12;
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

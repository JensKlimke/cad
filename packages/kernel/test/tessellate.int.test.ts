/**
 * Integration test for `createBox` — boots real OpenCascade.js WASM in
 * Node via Vitest and verifies the full createBox → tessellate → hash
 * pipeline produces a deterministic, geometrically correct result.
 *
 * The reference hashes are captured as inline snapshots so a breaking
 * kernel upgrade produces a reviewable diff rather than a silent
 * regression.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import {
  createBox,
  createPadFromRectangleSketch,
  initOCCT,
  tessellationToStl,
} from '../src/index.js';

import type { RectanglePadInput, TessellationResult } from '../src/index.js';

describe('createBox (integration, real OCCT boot)', () => {
  beforeAll(async () => {
    // Boot once for the whole suite so we don't measure WASM init time per case.
    await initOCCT();
  }, 60_000);

  it('reuses the booted OCCT instance', async () => {
    const first = await initOCCT();
    const second = await initOCCT();
    expect(second).toBe(first);
  });

  it('produces a non-empty tessellation for a 10×20×30 box', async () => {
    const result = await createBox({ width: 10, depth: 20, height: 30 });
    expect(result.metadata.triangleCount).toBeGreaterThan(0);
    expect(result.metadata.vertexCount).toBeGreaterThan(0);
    expect(result.positions.length).toBe(result.metadata.vertexCount * 3);
    expect(result.normals.length).toBe(result.metadata.vertexCount * 3);
    expect(result.indices.length).toBe(result.metadata.triangleCount * 3);
  }, 30_000);

  it('produces the expected bounding box for a 10×20×30 box', async () => {
    const result = await createBox({ width: 10, depth: 20, height: 30 });
    const [minX, minY, minZ] = result.metadata.bbox.min;
    const [maxX, maxY, maxZ] = result.metadata.bbox.max;
    expect(maxX - minX).toBeCloseTo(10, 3);
    expect(maxY - minY).toBeCloseTo(20, 3);
    expect(maxZ - minZ).toBeCloseTo(30, 3);
  }, 30_000);

  it('produces deterministic hashes across repeated calls', async () => {
    const first = await createBox({ width: 10, depth: 20, height: 30 });
    const second = await createBox({ width: 10, depth: 20, height: 30 });
    expect(second.metadata.hash).toBe(first.metadata.hash);
  }, 30_000);

  it('produces different hashes for different inputs', async () => {
    const a = await createBox({ width: 10, depth: 20, height: 30 });
    const b = await createBox({ width: 1, depth: 1, height: 1 });
    expect(a.metadata.hash).not.toBe(b.metadata.hash);
  }, 30_000);

  it('rejects invalid inputs with a ZodError', async () => {
    await expect(
      createBox({ width: 0, depth: 1, height: 1 } as unknown as TessellationResult),
    ).rejects.toThrow();
    await expect(
      createBox({ width: -1, depth: 1, height: 1 } as unknown as TessellationResult),
    ).rejects.toThrow();
    await expect(
      createBox({ width: Number.NaN, depth: 1, height: 1 } as unknown as TessellationResult),
    ).rejects.toThrow();
    await expect(
      createBox({
        width: Number.POSITIVE_INFINITY,
        depth: 1,
        height: 1,
      } as unknown as TessellationResult),
    ).rejects.toThrow();
    await expect(
      createBox({ width: 1, depth: 1 } as unknown as TessellationResult),
    ).rejects.toThrow();
  });

  it('matches the committed 10×20×30 tessellation-hash snapshot', async () => {
    const result = await createBox({ width: 10, depth: 20, height: 30 });
    expect(result.metadata.hash).toMatchInlineSnapshot(
      `"c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0"`,
    );
  }, 30_000);

  it('matches the committed 1×1×1 tessellation-hash snapshot', async () => {
    const result = await createBox({ width: 1, depth: 1, height: 1 });
    expect(result.metadata.hash).toMatchInlineSnapshot(
      `"d4174bb3c736687050746e725868d1a42b5d4f84fa309f2fe3b9da4581d1f143"`,
    );
  }, 30_000);
});

describe('createPadFromRectangleSketch (integration, real OCCT boot)', () => {
  beforeAll(async () => {
    await initOCCT();
  }, 60_000);

  const baseInput: RectanglePadInput = {
    plane: 'xy',
    x: 0,
    y: 0,
    width: 10,
    height: 20,
    length: 30,
    direction: 'up',
  };

  it('extrudes an XY rectangle upward', async () => {
    const result = await createPadFromRectangleSketch(baseInput);
    const [minX, minY, minZ] = result.metadata.bbox.min;
    const [maxX, maxY, maxZ] = result.metadata.bbox.max;

    expect(maxX - minX).toBeCloseTo(10, 3);
    expect(maxY - minY).toBeCloseTo(20, 3);
    expect(minZ).toBeCloseTo(0, 3);
    expect(maxZ).toBeCloseTo(30, 3);
  }, 30_000);

  it('extrudes a YZ rectangle downward', async () => {
    const result = await createPadFromRectangleSketch({
      ...baseInput,
      plane: 'yz',
      direction: 'down',
    });
    const [minX, minY, minZ] = result.metadata.bbox.min;
    const [maxX, maxY, maxZ] = result.metadata.bbox.max;

    expect(minX).toBeCloseTo(-30, 3);
    expect(maxX).toBeCloseTo(0, 3);
    expect(maxY - minY).toBeCloseTo(10, 3);
    expect(maxZ - minZ).toBeCloseTo(20, 3);
  }, 30_000);

  it('centers a symmetric XZ extrusion around the sketch plane', async () => {
    const result = await createPadFromRectangleSketch({
      ...baseInput,
      plane: 'xz',
      direction: 'symmetric',
    });
    const [, minY] = result.metadata.bbox.min;
    const [, maxY] = result.metadata.bbox.max;

    expect(minY).toBeCloseTo(-15, 3);
    expect(maxY).toBeCloseTo(15, 3);
  }, 30_000);

  it('rejects invalid rectangle pad inputs', async () => {
    await expect(
      createPadFromRectangleSketch({ ...baseInput, width: 0 } as RectanglePadInput),
    ).rejects.toThrow();
    await expect(
      createPadFromRectangleSketch({
        ...baseInput,
        plane: 'bad-plane',
      } as unknown as RectanglePadInput),
    ).rejects.toThrow();
  });
});

describe('tessellationToStl', () => {
  it('serializes indexed triangles to binary STL', async () => {
    const result = await createBox({ width: 1, depth: 1, height: 1 });
    const stl = tessellationToStl(result);
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);

    expect(stl.byteLength).toBe(84 + result.metadata.triangleCount * 50);
    expect(view.getUint32(80, true)).toBe(result.metadata.triangleCount);
  }, 30_000);

  it('uses a default normal for degenerate triangles', () => {
    const stl = tessellationToStl({
      positions: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      metadata: {
        hash: 'degenerate',
        triangleCount: 1,
        vertexCount: 3,
        bbox: {
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      },
    });
    const view = new DataView(stl.buffer, stl.byteOffset, stl.byteLength);

    expect(view.getFloat32(84, true)).toBe(0);
    expect(view.getFloat32(88, true)).toBe(0);
    expect(view.getFloat32(92, true)).toBe(1);
  });

  it('treats missing triangle vertices as zeroes when writing STL', () => {
    const missingVertexStl = tessellationToStl({
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([1, 2, 3]),
      metadata: {
        hash: 'missing-vertices',
        triangleCount: 1,
        vertexCount: 0,
        bbox: {
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      },
    });
    const missingIndexStl = tessellationToStl({
      positions: new Float32Array([]),
      normals: new Float32Array([]),
      indices: new Uint32Array([0]),
      metadata: {
        hash: 'missing-indices',
        triangleCount: 1,
        vertexCount: 0,
        bbox: {
          min: [0, 0, 0],
          max: [0, 0, 0],
        },
      },
    });

    expect(missingVertexStl).toHaveLength(134);
    expect(missingIndexStl).toHaveLength(100);
  });
});

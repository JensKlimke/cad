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

import { createBox, initOCCT } from '../src/index.js';

import type { TessellationResult } from '../src/index.js';

describe('createBox (integration, real OCCT boot)', () => {
  beforeAll(async () => {
    // Boot once for the whole suite so we don't measure WASM init time per case.
    await initOCCT();
  }, 60_000);

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

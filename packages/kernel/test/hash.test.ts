/**
 * Unit tests for `tessellationHash`.
 *
 * Pure-function coverage: no OCCT, no WASM, no disk I/O. Drives
 * `packages/kernel/src/hash.ts` to ≥95% lines — the easiest way to hit
 * the package's 90/85 coverage floor for `lib` presets.
 *
 * Three invariants we care about:
 *
 *   1. **Pure/deterministic** — same input → same output, always.
 *   2. **Stable to float noise** — positions/normals that differ by less
 *      than the canonicalization tolerance (1e-6) hash identically.
 *   3. **Sensitive to real changes** — any geometric or topological
 *      change that clears the tolerance produces a different hash.
 */

import { describe, expect, it } from 'vitest';

import { tessellationHash } from '../src/hash.js';

import type { TessellationResult } from '../src/types.js';

function makeTriangle(
  overrides: {
    readonly positions?: readonly number[];
    readonly normals?: readonly number[];
    readonly indices?: readonly number[];
  } = {},
): TessellationResult {
  const positions = new Float32Array(overrides.positions ?? [0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array(overrides.normals ?? [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = new Uint32Array(overrides.indices ?? [0, 1, 2]);
  return {
    positions,
    normals,
    indices,
    metadata: {
      hash: '',
      triangleCount: indices.length / 3,
      vertexCount: positions.length / 3,
      bbox: { min: [0, 0, 0], max: [1, 1, 0] },
    },
  };
}

describe('tessellationHash', () => {
  it('returns a 64-character lowercase hex SHA-256 digest', () => {
    const hash = tessellationHash(makeTriangle());
    expect(hash).toMatch(/^[\da-f]{64}$/u);
  });

  it('is deterministic across repeated calls on the same input', () => {
    const a = makeTriangle();
    const b = makeTriangle();
    expect(tessellationHash(a)).toBe(tessellationHash(b));
  });

  it('is stable against sub-1e-6 float noise', () => {
    const baseline = tessellationHash(makeTriangle());
    const noisy = makeTriangle({
      positions: [1e-9, 1e-9, 1e-9, 1 + 1e-9, 1e-9, 1e-9, 1e-9, 1 + 1e-9, 1e-9],
      normals: [1e-9, 1e-9, 1 + 1e-9, 1e-9, 1e-9, 1 + 1e-9, 1e-9, 1e-9, 1 + 1e-9],
    });
    expect(tessellationHash(noisy)).toBe(baseline);
  });

  it('is sensitive to changes above the canonicalization tolerance', () => {
    const baseline = tessellationHash(makeTriangle());
    const moved = makeTriangle({
      positions: [0, 0, 0, 1, 0, 0, 0, 1.001, 0],
    });
    expect(tessellationHash(moved)).not.toBe(baseline);
  });

  it('is sensitive to normal-vector changes', () => {
    const baseline = tessellationHash(makeTriangle());
    const flipped = makeTriangle({
      normals: [0, 0, -1, 0, 0, -1, 0, 0, -1],
    });
    expect(tessellationHash(flipped)).not.toBe(baseline);
  });

  it('is sensitive to index/connectivity changes', () => {
    const baseline = tessellationHash(makeTriangle({ indices: [0, 1, 2] }));
    const reordered = tessellationHash(makeTriangle({ indices: [0, 2, 1] }));
    expect(reordered).not.toBe(baseline);
  });

  it('handles empty geometry without throwing', () => {
    const empty: TessellationResult = {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
      metadata: {
        hash: '',
        triangleCount: 0,
        vertexCount: 0,
        bbox: { min: [0, 0, 0], max: [0, 0, 0] },
      },
    };
    const hash = tessellationHash(empty);
    expect(hash).toMatch(/^[\da-f]{64}$/u);
  });

  it('ignores the `metadata.hash` field when computing the digest', () => {
    const a = makeTriangle();
    const b = makeTriangle();
    const bWithDifferentMetadataHash: TessellationResult = {
      ...b,
      metadata: { ...b.metadata, hash: 'ignored-previous-value' },
    };
    expect(tessellationHash(a)).toBe(tessellationHash(bWithDifferentMetadataHash));
  });
});

/**
 * Unit tests for the mesh-packing helpers.
 *
 * These are pure functions: no OCCT, no WASM, no disk I/O. They exist as a
 * separate module precisely so they can be covered fast and the hot path
 * in `createBox` can rely on a well-tested packing layer.
 */

import { describe, expect, it } from 'vitest';

import { computeBBox, toFloat32, toUint32 } from '../src/mesh-utils.js';

describe('toFloat32', () => {
  it('returns the input unchanged when it is already a Float32Array', () => {
    const input = new Float32Array([1, 2, 3]);
    const out = toFloat32(input);
    expect(out).toBe(input);
  });

  it('converts a plain number array to a Float32Array with the same values', () => {
    const out = toFloat32([1, 2, 3, 4]);
    expect(out).toBeInstanceOf(Float32Array);
    expect([...out]).toEqual([1, 2, 3, 4]);
  });

  it('converts an empty array to an empty Float32Array', () => {
    const out = toFloat32([]);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(0);
  });
});

describe('toUint32', () => {
  it('returns the input unchanged when it is already a Uint32Array', () => {
    const input = new Uint32Array([0, 1, 2]);
    const out = toUint32(input);
    expect(out).toBe(input);
  });

  it('converts a plain number array to a Uint32Array with the same values', () => {
    const out = toUint32([0, 1, 2, 3]);
    expect(out).toBeInstanceOf(Uint32Array);
    expect([...out]).toEqual([0, 1, 2, 3]);
  });

  it('converts an empty array to an empty Uint32Array', () => {
    const out = toUint32([]);
    expect(out).toBeInstanceOf(Uint32Array);
    expect(out.length).toBe(0);
  });
});

describe('computeBBox', () => {
  it('returns a zero box for an empty positions buffer', () => {
    const bbox = computeBBox(new Float32Array(0));
    expect(bbox).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it('computes the AABB of a single vertex', () => {
    const bbox = computeBBox(new Float32Array([1, 2, 3]));
    expect(bbox).toEqual({ min: [1, 2, 3], max: [1, 2, 3] });
  });

  it('computes the AABB of a two-vertex diagonal', () => {
    const bbox = computeBBox(new Float32Array([-1, -2, -3, 4, 5, 6]));
    expect(bbox).toEqual({ min: [-1, -2, -3], max: [4, 5, 6] });
  });

  it('computes the AABB of a unit cube at the origin', () => {
    // 8 corners of a 1×1×1 cube at origin.
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
    ]);
    const bbox = computeBBox(positions);
    expect(bbox.min).toEqual([0, 0, 0]);
    expect(bbox.max).toEqual([1, 1, 1]);
  });

  it('handles all-negative positions', () => {
    const bbox = computeBBox(new Float32Array([-5, -4, -3, -2, -1, -0.5]));
    expect(bbox.min).toEqual([-5, -4, -3]);
    expect(bbox.max).toEqual([-2, -1, -0.5]);
  });
});

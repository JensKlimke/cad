import { describe, expect, it } from 'vitest';

import {
  createRectangleSketch,
  parseSketchSvg,
  resolveSketchValue,
  serializeSketchSvg,
  solveRectangleSketch,
} from '../src/index.js';

describe('@cad/sketch', () => {
  it('round-trips the canonical rectangle SVG subset', () => {
    const definition = createRectangleSketch({
      geometry: {
        kind: 'rectangle',
        x: 10,
        y: 20,
        width: 80,
        height: 40,
      },
    });
    const svg = serializeSketchSvg(definition);
    expect(parseSketchSvg(svg)).toEqual(definition.geometry);
  });

  it('solves a rectangle sketch with literal dimensions', async () => {
    const definition = createRectangleSketch({
      geometry: {
        kind: 'rectangle',
        x: 0,
        y: 0,
        width: 120,
        height: 60,
      },
    });
    const solved = await solveRectangleSketch(definition);
    expect(solved.status).toBe('fully_constrained');
    expect(solved.dimensions).toEqual({ width: 120, height: 60 });
    expect(parseSketchSvg(solved.svg)).toEqual(solved.geometry);
  });

  it('resolves parameter references and expressions with millimetre quantities', () => {
    expect(
      resolveSketchValue(
        { kind: 'reference', name: 'width' },
        { width: { value: 42, unit: 'mm' } },
        10,
      ),
    ).toBe(42);
    expect(
      resolveSketchValue(
        { kind: 'expression', source: 'width * 2', unit: 'mm' },
        { width: { value: 21, unit: 'mm' } },
        10,
      ),
    ).toBe(42);
  });

  it('reports invalid dimensions as over-constrained feedback', async () => {
    const definition = createRectangleSketch({
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'literal', value: -1, unit: 'mm' },
        height: { kind: 'literal', value: 20, unit: 'mm' },
      },
    });
    const solved = await solveRectangleSketch(definition);
    expect(solved.status).toBe('over_constrained');
    expect(solved.diagnostics).not.toHaveLength(0);
  });
});

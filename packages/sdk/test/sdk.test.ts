import { describe, expect, it } from 'vitest';

import {
  body,
  defineDocument,
  docMetadata,
  expression,
  feature,
  handle,
  literal,
  pad,
  parameters,
  reference,
  sketch,
} from '../src/index.js';

const DEFAULT_SKETCH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="80" height="50" fill="none" stroke="currentColor" stroke-width="1" /></svg>';
const DEFAULT_SKETCH_CONSTRAINTS = {
  kind: 'rectangle' as const,
  anchor: 'origin' as const,
  width: { kind: 'literal' as const, value: 80, unit: 'mm' as const },
  height: { kind: 'literal' as const, value: 50, unit: 'mm' as const },
};

describe('@cad/sdk', () => {
  it('builds a minimal document definition', () => {
    const document = defineDocument({
      parameters: parameters({
        width: { kind: 'number', value: 10, unit: 'mm' },
        depth: { kind: 'number', value: 20, unit: 'mm' },
        height: { kind: 'expression', expression: '2 * width', unit: 'mm' },
      }),
      body: body([
        sketch({
          id: 'sketch_1',
          svg: DEFAULT_SKETCH_SVG,
          constraints: DEFAULT_SKETCH_CONSTRAINTS,
        }),
        pad({
          id: 'pad_1',
          sketch: feature('sketch_1'),
          length: reference('height'),
          direction: 'up',
        }),
      ]),
    });

    expect(document.kind).toBe('document');
    expect(document.body.features[1]).toMatchObject({ kind: 'pad', id: 'pad_1' });
  });

  it('normalizes shorthand scalar inputs for pad', () => {
    const feature = pad({
      sketch: 'sketch_1',
      length: expression('height', 'mm'),
      direction: 'symmetric',
    });

    expect(feature.sketch).toEqual({ kind: 'feature', id: 'sketch_1' });
    expect(feature.length).toEqual({ kind: 'expression', source: 'height', unit: 'mm' });
    expect(feature.direction).toBe('symmetric');
  });

  it('normalizes numeric and named pad lengths', () => {
    expect(
      pad({
        sketch: 'sketch_1',
        length: 12,
      }).length,
    ).toEqual({ kind: 'literal', value: 12, unit: 'mm' });

    expect(
      pad({
        sketch: 'sketch_1',
        length: 'height',
      }).length,
    ).toEqual({ kind: 'reference', name: 'height' });
  });

  it('creates persisted sketch features', () => {
    expect(sketch({ svg: DEFAULT_SKETCH_SVG, constraints: DEFAULT_SKETCH_CONSTRAINTS })).toEqual({
      kind: 'sketch',
      plane: 'xy',
      svg: DEFAULT_SKETCH_SVG,
      constraints: DEFAULT_SKETCH_CONSTRAINTS,
    });
    expect(
      sketch({
        id: 'sketch_1',
        plane: 'xy',
        svg: DEFAULT_SKETCH_SVG,
        constraints: DEFAULT_SKETCH_CONSTRAINTS,
      }),
    ).toEqual({
      kind: 'sketch',
      id: 'sketch_1',
      plane: 'xy',
      svg: DEFAULT_SKETCH_SVG,
      constraints: DEFAULT_SKETCH_CONSTRAINTS,
    });
  });

  it('exposes helper constructors and operation metadata', () => {
    expect(literal(5, 'mm')).toEqual({ kind: 'literal', value: 5, unit: 'mm' });
    expect(expression('width', 'mm')).toEqual({ kind: 'expression', source: 'width', unit: 'mm' });
    expect(reference('width')).toEqual({ kind: 'reference', name: 'width' });
    expect(
      handle({
        id: 'handle:pad_1.face.top',
        entityKind: 'face',
        label: 'Top face',
        selectors: [{ kind: 'construction', featureId: 'pad_1', path: 'pad_1.face.top' }],
      }),
    ).toEqual({
      id: 'handle:pad_1.face.top',
      entityKind: 'face',
      label: 'Top face',
      selectors: [{ kind: 'construction', featureId: 'pad_1', path: 'pad_1.face.top' }],
    });
    expect(docMetadata.pad.title).toContain('Pad');
  });
});

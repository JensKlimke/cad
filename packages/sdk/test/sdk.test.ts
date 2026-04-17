import { describe, expect, it } from 'vitest';

import { body, defineDocument, docMetadata, expression, literal, pad, parameters, reference, sketch } from '../src/index.js';

describe('@cad/sdk', () => {
  it('builds a minimal document definition', () => {
    const document = defineDocument({
      parameters: parameters({
        width: { kind: 'number', value: 10, unit: 'mm' },
        depth: { kind: 'number', value: 20, unit: 'mm' },
        height: { kind: 'expression', expression: '2 * width', unit: 'mm' },
      }),
      body: body([
        pad({
          id: 'pad_1',
          width: reference('width'),
          depth: reference('depth'),
          height: reference('height'),
        }),
      ]),
    });

    expect(document.kind).toBe('document');
    expect(document.body.features[0]).toMatchObject({ kind: 'pad', id: 'pad_1' });
  });

  it('normalizes shorthand scalar inputs for pad', () => {
    const feature = pad({
      width: 4,
      depth: 'depth',
      height: expression('height', 'mm'),
    });

    expect(feature.width).toEqual({ kind: 'literal', value: 4, unit: 'mm' });
    expect(feature.depth).toEqual({ kind: 'reference', name: 'depth' });
    expect(feature.height).toEqual({ kind: 'expression', source: 'height', unit: 'mm' });
  });

  it('creates sketch features with optional plane metadata', () => {
    expect(sketch()).toEqual({ kind: 'sketch' });
    expect(sketch({ id: 'sketch_1', plane: 'xy' })).toEqual({
      kind: 'sketch',
      id: 'sketch_1',
      plane: 'xy',
    });
  });

  it('exposes helper constructors and operation metadata', () => {
    expect(literal(5, 'mm')).toEqual({ kind: 'literal', value: 5, unit: 'mm' });
    expect(expression('width', 'mm')).toEqual({ kind: 'expression', source: 'width', unit: 'mm' });
    expect(reference('width')).toEqual({ kind: 'reference', name: 'width' });
    expect(docMetadata.pad.title).toContain('Pad');
  });
});

import { body, defineDocument, feature, literal, pad, parameters, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 8, unit: 'mm' },
    depth: { kind: 'number', value: 12, unit: 'mm' },
    height: { kind: 'expression', expression: 'width + depth', unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="80" height="50" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'expression', source: 'width + depth', unit: 'mm' },
      },
    }),
    pad({
      id: 'pad_2',
      sketch: feature('sketch_1'),
      length: literal(15, 'mm'),
      direction: 'symmetric',
    }),
  ]),
});

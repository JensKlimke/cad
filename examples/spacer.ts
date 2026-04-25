import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    length: { kind: 'number', value: 48, unit: 'mm' },
    width: { kind: 'number', value: 22, unit: 'mm' },
    height: { kind: 'number', value: 8, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="48" height="22" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'length' },
        height: { kind: 'reference', name: 'width' },
      },
    }),
    pad({
      id: 'pad_1',
      sketch: feature('sketch_1'),
      length: reference('height'),
      direction: 'up',
    }),
  ]),
});

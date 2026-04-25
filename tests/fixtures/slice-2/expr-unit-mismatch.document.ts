import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    angle: { kind: 'number', value: 45, unit: 'deg' },
    height: { kind: 'expression', expression: 'width + angle', unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'literal', value: 10, unit: 'mm' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
});

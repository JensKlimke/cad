import { body, defineDocument, parameters, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({}),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="80" height="50" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'literal', value: 80, unit: 'mm' },
        height: { kind: 'literal', value: 50, unit: 'mm' },
      },
    }),
  ]),
});

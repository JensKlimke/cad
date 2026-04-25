/**
 * Canonical default Slice 2 document source for newly created documents.
 *
 * Chosen to match the existing Slice 0 placeholder viewport dimensions
 * (10 × 20 × 30 mm) so the lifecycle e2e hash remains stable after the
 * document page starts building real persisted sources.
 */

export const DEFAULT_DOCUMENT_SOURCE = `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="10" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
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
`;

/**
 * Canonical default Slice 2 document source for newly created documents.
 *
 * Chosen to match the existing Slice 0 placeholder viewport dimensions
 * (10 × 20 × 30 mm) so the lifecycle e2e hash remains stable after the
 * document page starts building real persisted sources.
 */

export const DEFAULT_DOCUMENT_SOURCE = `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
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
`;

import { body, defineDocument, expression, literal, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { value: 8, unit: 'mm' },
    depth: { value: 12, unit: 'mm' },
    height: { expression: 'width + depth', unit: 'mm' },
  }),
  body: body([
    sketch({ id: 'sketch_1', plane: 'xy' }),
    pad({
      id: 'pad_2',
      width: expression('width + width', 'mm'),
      depth: reference('depth'),
      height: literal(15, 'mm'),
    }),
  ]),
});

import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { expression: 'height', unit: 'mm' },
    depth: { value: 10, unit: 'mm' },
    height: { expression: 'width', unit: 'mm' },
  }),
  body: body([
    pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') }),
  ]),
});

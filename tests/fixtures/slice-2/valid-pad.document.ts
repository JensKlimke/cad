import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { value: 10, unit: 'mm' },
    depth: { value: 20, unit: 'mm' },
    height: { expression: '2 * width', unit: 'mm' },
  }),
  body: body([pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') })]),
});

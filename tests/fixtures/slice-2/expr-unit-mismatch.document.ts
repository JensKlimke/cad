import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { value: 10, unit: 'mm' },
    angle: { value: 45, unit: 'deg' },
    height: { expression: 'width + angle', unit: 'mm' },
  }),
  body: body([
    pad({ id: 'pad_1', width: reference('width'), depth: reference('width'), height: reference('height') }),
  ]),
});

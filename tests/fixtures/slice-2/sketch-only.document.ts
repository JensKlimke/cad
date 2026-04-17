import { body, defineDocument, parameters, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({}),
  body: body([sketch({ id: 'sketch_1', plane: 'xy' })]),
});

import { body, defineDocument, parameters } from '@cad/sdk';

while (Date.now() > 0) {
  Math.random();
}

export default defineDocument({
  parameters: parameters({}),
  body: body([]),
});

# @cad/tests-api

Fastify harness + Supertest e2e suite. Sliced thin at Slice 0: the harness
exposes a single `/health` endpoint so the harness itself is testable and
proves the Fastify + Zod + Supertest pipeline runs green in CI. Slice 1
extends it with the real project/document CRUD routes.

## Layout

```
src/
  harness.ts      # createTestApp() → Fastify instance with /health
  health.ts       # /health route + Zod schema
test/
  harness.test.ts # Supertest assertions against createTestApp()
```

## Usage from other packages

The harness is designed to be imported directly (it is a workspace-internal
package — no build step). Slice 1's server tests will compose it with
additional route plugins:

```ts
import { createTestApp } from '@cad/tests-api/src/harness.js';
import request from 'supertest';

const app = await createTestApp();
try {
  const response = await request(app.server).get('/health');
  expect(response.body).toEqual({ ok: true });
} finally {
  await app.close();
}
```

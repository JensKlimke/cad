# @cad/tests-containers

Testcontainers factories for the CAD monorepo. Consumers (API e2e tests,
runtime integration tests, Slice 1's Fastify server) import `startPostgres()`
or `startMinio()` to get a real database/object-store instance for a single
test suite, with automatic container teardown.

## Usage

```ts
import { startPostgres, startMinio } from '@cad/tests-containers';
import { beforeAll, afterAll } from 'vitest';

let pg: Awaited<ReturnType<typeof startPostgres>>;

beforeAll(async () => {
  pg = await startPostgres();
  // pg.connectionString → postgres://cad:cad@127.0.0.1:55432/cad
}, 60_000);

afterAll(async () => {
  await pg.stop();
});
```

## Smoke test

`test/smoke.int.test.ts` boots both containers end-to-end. It is gated behind
`INTEGRATION=1` so a default `pnpm test` stays fast:

```bash
INTEGRATION=1 pnpm --filter @cad/tests-containers test
```

The smoke test is the primary way to verify a dev machine has Docker
running correctly.

/**
 * Container boot smoke test.
 *
 * Gated behind the `INTEGRATION=1` env var so a default `pnpm test`
 * doesn't fire up Docker on every developer machine. Run locally with:
 *
 *     INTEGRATION=1 pnpm --filter @cad/tests-containers test
 *
 * Exists primarily as the canonical way to verify a dev machine has Docker
 * running correctly and that the factories start and stop cleanly.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { startMinio, startPostgres } from '../src/index.js';

const shouldRun = process.env['INTEGRATION'] === '1';

describe.runIf(shouldRun)('container factories (requires Docker)', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterAll(async () => {
    await Promise.all(cleanups.map(async (fn) => fn()));
  });

  it('boots Postgres 16 and reports a usable connection string', async () => {
    const pg = await startPostgres();
    cleanups.push(pg.stop);
    expect(pg.connectionString).toMatch(/^postgres(ql)?:\/\//u);
    expect(pg.port).toBeGreaterThan(0);
    expect(pg.database).toBe('cad');
  }, 90_000);

  it('boots MinIO and reports a usable S3 endpoint', async () => {
    const minio = await startMinio();
    cleanups.push(minio.stop);
    expect(minio.endpoint).toMatch(/^http:\/\//u);
    expect(minio.port).toBeGreaterThan(0);
    expect(minio.accessKey.length).toBeGreaterThan(0);
  }, 90_000);
});

describe.runIf(!shouldRun)('container factories (smoke skipped)', () => {
  it('skips container boot when INTEGRATION is not set', () => {
    // Placeholder assertion so vitest has at least one test to run in the
    // default `pnpm test` path — otherwise the suite reports zero tests
    // and some coverage tools treat that as an error.
    expect(shouldRun).toBe(false);
  });
});

/**
 * `@cad/tests-containers` — Testcontainers factories for the CAD monorepo.
 *
 * Public surface:
 *
 * - `startPostgres(options?)` → `StartedPostgres`
 * - `startMinio(options?)`    → `StartedMinio`
 *
 * Both return handles with a `stop()` method the caller invokes in an
 * `afterAll` hook. Stopping is idempotent and safe to call more than once.
 */

export { startPostgres } from './postgres.js';
export type { StartedPostgres, StartPostgresOptions } from './postgres.js';

export { startMinio } from './minio.js';
export type { StartedMinio, StartMinioOptions } from './minio.js';

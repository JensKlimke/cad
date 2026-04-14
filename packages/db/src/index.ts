/**
 * Public surface of `@cad/db`.
 *
 * Wave A scope: schema, client factory, ULID helpers. Repositories
 * land in Wave B1; the migrator script lands alongside.
 */

export { closeDbClient, createDbClient, type DbClient, type DbEnv } from './client.js';
export { isUlid, parseUlid, ulid, type Ulid } from './ids.js';
export * as schema from './schema/index.js';

/**
 * Public surface of `@cad/db`.
 *
 * - **Wave A**: schema, client factory, ULID helpers
 * - **Wave B1** (current): repositories + migrator
 */

export { closeDbClient, createDbClient, type DbClient, type DbEnv } from './client.js';
export { isUlid, parseUlid, ulid, type Ulid } from './ids.js';
export * from './repositories/index.js';
export * as schema from './schema/index.js';

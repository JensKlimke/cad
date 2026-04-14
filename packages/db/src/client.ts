/**
 * Drizzle client factory.
 *
 * `createDbClient(env)` opens a single `pg.Pool` against the
 * configured Postgres URL and binds Drizzle to the full schema
 * exported from `./schema`. Callers own the pool lifecycle — call
 * `close(client)` during graceful shutdown.
 *
 * Deliberately decoupled from any framework: Fastify, the migrator
 * script, integration tests, and ad-hoc consumers all build the
 * client the same way.
 */

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index.js';

const { Pool } = pg;

/**
 * Environment shape consumed by the client factory. The full
 * server env (`apps/server/src/config/env.ts`) is a strict
 * superset; tests can construct a minimal `DbEnv` directly.
 */
export interface DbEnv {
  /** Postgres connection string, e.g. `postgresql://cad:cad@localhost:5432/cad`. */
  readonly DATABASE_URL: string;
  /** Optional pool max size (defaults to 10). */
  readonly DATABASE_POOL_MAX?: number;
  /** Optional connection timeout in milliseconds (defaults to 5000). */
  readonly DATABASE_CONNECTION_TIMEOUT_MS?: number;
}

/**
 * Concrete Drizzle client type bound to the full `@cad/db` schema.
 *
 * Drizzle's `NodePgDatabase` already exposes the underlying
 * `pg.Pool` via `$client` — callers reach the pool through that
 * field; `closeDbClient` is the canonical teardown helper.
 */
export type DbClient = NodePgDatabase<typeof schema> & { readonly $client: pg.Pool };

/**
 * Build a Drizzle client backed by a fresh `pg.Pool`. The pool
 * lifetime is owned by the caller — every `createDbClient` must be
 * paired with a `closeDbClient` during graceful shutdown.
 */
export function createDbClient(env: DbEnv): DbClient {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX ?? 10,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5000,
  });
  return drizzle(pool, { schema }) as DbClient;
}

/**
 * Gracefully close the underlying `pg.Pool`. Idempotent — calling
 * twice is safe because `pg.Pool.end()` is itself idempotent.
 */
export async function closeDbClient(client: DbClient): Promise<void> {
  await client.$client.end();
}

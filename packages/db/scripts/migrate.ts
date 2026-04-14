/**
 * Standalone migrator entrypoint.
 *
 * Runs the committed Drizzle migrations under `packages/db/drizzle/`
 * against the database in `DATABASE_URL`. Used by:
 *
 *   1. The Wave E `migrator` Compose service, which depends on
 *      `postgres: condition: service_healthy` and gates the
 *      `server` service via `condition: service_completed_successfully`.
 *   2. CI jobs (`test-db`, `test-api`, `test-compose`) that need a
 *      schema-migrated Postgres before exercising the API.
 *   3. Local dev: `DATABASE_URL=... pnpm --filter @cad/db migrate`
 *      after `docker compose up postgres`.
 *
 * The script is intentionally self-contained — no Fastify, no
 * application code, no env validation beyond the single
 * `DATABASE_URL` it actually needs. It exits zero on success and
 * non-zero (with the migrator error written to stderr) on failure.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const { Pool } = pg;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(HERE, '..', 'drizzle');

interface MigrateOptions {
  readonly databaseUrl: string;
  readonly migrationsFolder?: string;
  readonly logger?: (line: string) => void;
}

/**
 * Apply every committed migration to the configured database.
 *
 * Idempotent: re-running against an already-migrated database
 * makes no schema changes (Drizzle tracks applied migrations in
 * the `__drizzle_migrations` table). Throws if Postgres is
 * unreachable, the migrations folder is malformed, or a migration
 * SQL statement fails.
 */
export async function runMigrations(options: MigrateOptions): Promise<void> {
  const log = options.logger ?? ((line) => console.log(`[migrate] ${line}`));
  const folder = options.migrationsFolder ?? MIGRATIONS_FOLDER;

  log(`connecting to ${options.databaseUrl.replace(/:[^:@/]+@/u, ':***@')}`);
  const pool = new Pool({ connectionString: options.databaseUrl });
  try {
    const db = drizzle(pool);
    log(`applying migrations from ${folder}`);
    await migrate(db, { migrationsFolder: folder });
    log('migrations applied successfully');
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    process.stderr.write('[migrate] DATABASE_URL is required\n');
    process.exit(1);
  }
  try {
    await runMigrations({ databaseUrl });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[migrate] failed: ${message}\n`);
    process.exit(1);
  }
}

// Only run main() when invoked as a script — not when imported by
// the integration test suite.
if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  void main();
}

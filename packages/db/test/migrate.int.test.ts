/**
 * Integration test for the migrator.
 *
 * Boots a fresh Postgres via `@cad/tests-containers`, runs the
 * migrator twice (idempotency), and asserts every Slice 1 table
 * exists with the expected columns. This is the first time
 * `tests/containers` is consumed for real — the Slice 0 scaffolding
 * graduates from a passing import to a load-bearing dependency.
 *
 * Gated on `INTEGRATION=1` via `vitest.config.ts` so plain
 * `pnpm test` stays fast.
 */

import { startPostgres, type StartedPostgres } from '@cad/tests-containers';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../scripts/migrate.js';
import { closeDbClient, createDbClient, type DbClient } from '../src/client.js';

const TEST_TIMEOUT_MS = 90_000;

describe('migrator integration', () => {
  let postgres: StartedPostgres;
  let client: DbClient;

  beforeAll(async () => {
    postgres = await startPostgres();
    // Install the citext extension before migrations run — the
    // production stack does this via postgres-init/01-extensions.sql,
    // but Testcontainers' raw image has no init scripts mounted.
    const bootstrap = createDbClient({ DATABASE_URL: postgres.connectionString });
    await bootstrap.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
    await bootstrap.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await closeDbClient(bootstrap);

    await runMigrations({
      databaseUrl: postgres.connectionString,
      logger: () => {}, // suppress test-time log noise
    });
    client = createDbClient({ DATABASE_URL: postgres.connectionString });
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (client !== undefined) {
      await closeDbClient(client);
    }
    if (postgres !== undefined) {
      await postgres.stop();
    }
  });

  it('creates every Slice 1 table', async () => {
    const result = await client.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tableNames = result.rows.map((row) => row.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'document_versions',
        'documents',
        'projects',
        'sessions',
        'users',
        'workspaces',
      ]),
    );
  });

  it('creates the unique index on (workspace_id, email)', async () => {
    const result = await client.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'users'
    `);
    const indexNames = result.rows.map((row) => row.indexname);
    expect(indexNames).toContain('users_email_workspace_uq');
  });

  it('creates the cursor pagination indexes on projects + documents', async () => {
    const result = await client.execute<{ indexname: string }>(sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname IN (
        'projects_workspace_created_at_idx',
        'documents_project_created_at_idx',
        'document_versions_document_created_at_idx',
        'sessions_expires_at_idx'
      )
    `);
    expect(result.rows).toHaveLength(4);
  });

  it('uses citext for users.email so case-insensitive lookups index-hit', async () => {
    const result = await client.execute<{ data_type: string; udt_name: string }>(sql`
      SELECT data_type, udt_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'email'
    `);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.udt_name).toBe('citext');
  });

  it('is idempotent — re-running the migrator is a no-op', async () => {
    // Second invocation must not throw or alter the schema.
    await runMigrations({
      databaseUrl: postgres.connectionString,
      logger: () => {},
    });
    const result = await client.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM __drizzle_migrations
    `);
    // Exactly one applied migration tracked, regardless of the
    // number of times we invoked the migrator.
    expect(result.rows[0]?.count).toBe('1');
  });
});

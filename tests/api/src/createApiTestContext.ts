/**
 * Shared harness factory for the API e2e suite.
 *
 * Boots a Testcontainers Postgres + MinIO, runs the Drizzle
 * migrator, builds the Fastify app via `@cad/server/app`, and
 * returns a context handle each spec file uses in its `beforeAll`.
 *
 * `buildApp` already calls `seedOnFirstBoot` (fixed in Wave E1),
 * so the default workspace + admin user exist the moment the
 * app is ready. The harness opens a short-lived `DbClient` to
 * capture the workspace + admin ids so tests can drive
 * `/auth/login` without re-running the seeder.
 *
 * A separate introspection `DbClient` is used instead of the
 * Fastify decorator (`app.db`) because the decorator's module
 * augmentation lives in an internal plugin file that does not
 * propagate through the `@cad/server/app` subpath export.
 *
 * Teardown runs in reverse order: Fastify → MinIO → Postgres.
 * Each step is wrapped in try/catch so a partial failure still
 * releases the remaining resources.
 */

import { closeDbClient, createDbClient, createUserRepo } from '@cad/db';
import { buildApp } from '@cad/server/app';
import { type Env } from '@cad/server/config/env';
import {
  startMinio,
  startPostgres,
  type StartedMinio,
  type StartedPostgres,
} from '@cad/tests-containers';

import { runMigrations } from '../../../packages/db/scripts/migrate.js';

import { buildTestEnv } from './buildTestEnv.js';

import type { FastifyInstance } from 'fastify';

export interface ApiTestContext {
  readonly app: FastifyInstance;
  readonly env: Env;
  readonly postgres: StartedPostgres;
  readonly minio: StartedMinio;
  readonly adminUserId: string;
  readonly workspaceId: string;
  close(): Promise<void>;
}

interface WorkspaceRow {
  readonly id: string;
}

/**
 * Boot a Testcontainers-backed Fastify instance ready for
 * Supertest. Callers invoke this in `beforeAll` and call
 * `context.close()` in `afterAll`.
 */
export async function createApiTestContext(): Promise<ApiTestContext> {
  const [postgres, minio] = await Promise.all([startPostgres(), startMinio()]);

  // Install the citext + pgcrypto extensions before migrations
  // run. Production does this via `postgres-init/01-extensions.sql`,
  // but Testcontainers mounts no init scripts. Using the underlying
  // pg pool keeps the harness free of a direct `drizzle-orm`
  // dependency — everything schema-shaped goes through `@cad/db`.
  const bootstrap = createDbClient({ DATABASE_URL: postgres.connectionString });
  try {
    await bootstrap.$client.query('CREATE EXTENSION IF NOT EXISTS citext');
    await bootstrap.$client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } finally {
    await closeDbClient(bootstrap);
  }

  await runMigrations({
    databaseUrl: postgres.connectionString,
    logger: () => {},
  });

  const env = buildTestEnv({
    DATABASE_URL: postgres.connectionString,
    MINIO_ENDPOINT: minio.endpoint,
    MINIO_ACCESS_KEY: minio.accessKey,
    MINIO_SECRET_KEY: minio.secretKey,
  });

  const app = await buildApp({ env, logger: false });

  // Seeder already ran inside `buildApp`. Query the workspace +
  // admin ids via a throwaway client so specs can assert
  // user-scoped behaviour without re-running the login flow.
  const introspect = createDbClient({ DATABASE_URL: postgres.connectionString });
  let workspaceId: string;
  let adminUserId: string;
  try {
    const workspaceResult = await introspect.$client.query<WorkspaceRow>(
      'SELECT id FROM workspaces LIMIT 1',
    );
    const firstWorkspace = workspaceResult.rows[0];
    if (firstWorkspace === undefined) {
      throw new Error('createApiTestContext: seeder did not create a workspace');
    }
    workspaceId = firstWorkspace.id;

    const userRepo = createUserRepo(introspect);
    const admin = await userRepo.findByEmail({
      workspaceId,
      email: env.ADMIN_EMAIL,
    });
    if (admin === null) {
      throw new Error('createApiTestContext: seeder did not create an admin user');
    }
    adminUserId = admin.id;
  } finally {
    await closeDbClient(introspect);
  }

  return {
    app,
    env,
    postgres,
    minio,
    adminUserId,
    workspaceId,
    async close() {
      try {
        await app.close();
      } catch {
        // Continue teardown so containers are always released.
      }
      try {
        await minio.stop();
      } catch {
        // Ignore.
      }
      try {
        await postgres.stop();
      } catch {
        // Ignore.
      }
    },
  };
}

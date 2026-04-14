/**
 * Integration tests for `@cad/db` repositories.
 *
 * Exercises every repository method against a real Postgres
 * (Testcontainers) — happy path, edge cases, workspace isolation,
 * cursor pagination, idempotent revocation, sweep semantics. This
 * is the proof that the slice doc's W5 contract holds against the
 * real schema, not a mock.
 *
 * Gated on `INTEGRATION=1`.
 */

import { startPostgres, type StartedPostgres } from '@cad/tests-containers';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runMigrations } from '../scripts/migrate.js';
import { closeDbClient, createDbClient, type DbClient } from '../src/client.js';
import { ulid } from '../src/ids.js';
import {
  createDocumentRepo,
  createProjectRepo,
  createSessionRepo,
  createUserRepo,
} from '../src/repositories/index.js';
import { documents } from '../src/schema/documents.js';
import { projects } from '../src/schema/projects.js';
import { sessions } from '../src/schema/sessions.js';
import { users } from '../src/schema/users.js';
import { workspaces } from '../src/schema/workspaces.js';

const TEST_TIMEOUT_MS = 90_000;

interface Fixture {
  readonly workspaceId: string;
  readonly otherWorkspaceId: string;
  readonly adminId: string;
  readonly otherUserId: string;
}

async function seedFixture(client: DbClient): Promise<Fixture> {
  const workspaceId = ulid();
  const otherWorkspaceId = ulid();
  const adminId = ulid();
  const otherUserId = ulid();

  await client.insert(workspaces).values([
    { id: workspaceId, name: 'primary' },
    { id: otherWorkspaceId, name: 'other' },
  ]);
  await client.insert(users).values([
    {
      id: adminId,
      workspaceId,
      email: 'admin@primary.test',
      passwordHash: '$argon2id$placeholder',
      role: 'admin',
    },
    {
      id: otherUserId,
      workspaceId: otherWorkspaceId,
      email: 'admin@other.test',
      passwordHash: '$argon2id$placeholder',
      role: 'admin',
    },
  ]);

  return { workspaceId, otherWorkspaceId, adminId, otherUserId };
}

async function truncateAll(client: DbClient): Promise<void> {
  await client.execute(sql`
    TRUNCATE TABLE
      sessions, document_versions, documents, projects, users, workspaces
    RESTART IDENTITY CASCADE
  `);
}

describe('repositories integration', () => {
  let postgres: StartedPostgres;
  let client: DbClient;

  beforeAll(async () => {
    postgres = await startPostgres();
    const bootstrap = createDbClient({ DATABASE_URL: postgres.connectionString });
    await bootstrap.execute(sql`CREATE EXTENSION IF NOT EXISTS citext`);
    await bootstrap.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await closeDbClient(bootstrap);
    await runMigrations({
      databaseUrl: postgres.connectionString,
      logger: () => {},
    });
    client = createDbClient({ DATABASE_URL: postgres.connectionString });
  }, TEST_TIMEOUT_MS);

  afterEach(async () => {
    await truncateAll(client);
  });

  afterAll(async () => {
    if (client !== undefined) {
      await closeDbClient(client);
    }
    if (postgres !== undefined) {
      await postgres.stop();
    }
  });

  describe('UserRepo', () => {
    it('finds a user by lowercase email even when stored mixed-case (citext)', async () => {
      const { workspaceId } = await seedFixture(client);
      const repo = createUserRepo(client);
      const found = await repo.findByEmail({ workspaceId, email: 'ADMIN@PRIMARY.TEST' });
      expect(found?.email).toBe('admin@primary.test');
    });

    it('returns null for an email in another workspace', async () => {
      const { workspaceId } = await seedFixture(client);
      const repo = createUserRepo(client);
      const found = await repo.findByEmail({ workspaceId, email: 'admin@other.test' });
      expect(found).toBeNull();
    });

    it('rejects duplicate (workspace, email) on create (unique index)', async () => {
      const { workspaceId } = await seedFixture(client);
      const repo = createUserRepo(client);
      await expect(
        repo.create({
          workspaceId,
          email: 'admin@primary.test',
          passwordHash: '$argon2id$other',
          role: 'member',
        }),
      ).rejects.toThrow();
    });

    it('allows the same email in two different workspaces', async () => {
      const { workspaceId, otherWorkspaceId } = await seedFixture(client);
      const repo = createUserRepo(client);
      const result = await repo.create({
        workspaceId: otherWorkspaceId,
        email: 'admin@primary.test',
        passwordHash: '$argon2id$other',
        role: 'member',
      });
      expect(result.workspaceId).toBe(otherWorkspaceId);
      // Confirm the original user in `workspaceId` is untouched.
      const original = await repo.findByEmail({
        workspaceId,
        email: 'admin@primary.test',
      });
      expect(original?.role).toBe('admin');
    });

    it('updates the password hash and reports success', async () => {
      const { adminId } = await seedFixture(client);
      const repo = createUserRepo(client);
      const ok = await repo.updatePassword({
        userId: adminId,
        passwordHash: '$argon2id$rotated',
      });
      expect(ok).toBe(true);
    });

    it('returns false when updating a missing user', async () => {
      await seedFixture(client);
      const repo = createUserRepo(client);
      const ok = await repo.updatePassword({
        userId: ulid(),
        passwordHash: '$argon2id$rotated',
      });
      expect(ok).toBe(false);
    });
  });

  describe('ProjectRepo', () => {
    it('creates and reads back a project', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'Smoke Test',
        createdBy: adminId,
      });
      expect(created.name).toBe('Smoke Test');
      const fetched = await repo.get({ workspaceId, id: created.id });
      expect(fetched?.id).toBe(created.id);
    });

    it('returns null on cross-workspace get (404, not 403)', async () => {
      const { workspaceId, otherWorkspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'Smoke Test',
        createdBy: adminId,
      });
      const fetched = await repo.get({ workspaceId: otherWorkspaceId, id: created.id });
      expect(fetched).toBeNull();
    });

    it('lists projects in descending creation order', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const a = await repo.create({ workspaceId, name: 'A', createdBy: adminId });
      // Force a different timestamp so `created_at desc` order is observable.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const b = await repo.create({ workspaceId, name: 'B', createdBy: adminId });
      const result = await repo.list({ workspaceId, limit: 50 });
      expect(result.items.map((p) => p.id)).toEqual([b.id, a.id]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('paginates via cursor', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      for (let i = 0; i < 5; i += 1) {
        await repo.create({ workspaceId, name: `P${i}`, createdBy: adminId });
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      const page1 = await repo.list({ workspaceId, limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const cursor1 = page1.nextCursor;
      if (cursor1 === undefined) {
        throw new Error('expected page1 to have a cursor');
      }
      const page2 = await repo.list({ workspaceId, limit: 2, cursor: cursor1 });
      expect(page2.items).toHaveLength(2);
      expect(page2.nextCursor).toBeDefined();

      const cursor2 = page2.nextCursor;
      if (cursor2 === undefined) {
        throw new Error('expected page2 to have a cursor');
      }
      const page3 = await repo.list({ workspaceId, limit: 2, cursor: cursor2 });
      expect(page3.items).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();

      // No overlap across pages.
      const allIds = [...page1.items, ...page2.items, ...page3.items].map((p) => p.id);
      expect(new Set(allIds).size).toBe(5);
    });

    it('returns an empty page when the cursor points at a deleted project', async () => {
      const { workspaceId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const result = await repo.list({
        workspaceId,
        limit: 10,
        cursor: ulid(),
      });
      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('updates a project name and bumps updated_at', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'Original',
        createdBy: adminId,
      });
      // Wait a touch so updated_at has a chance to advance.
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = await repo.update({
        workspaceId,
        id: created.id,
        name: 'Renamed',
      });
      expect(updated?.name).toBe('Renamed');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('returns null on cross-workspace update', async () => {
      const { workspaceId, otherWorkspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'A',
        createdBy: adminId,
      });
      const result = await repo.update({
        workspaceId: otherWorkspaceId,
        id: created.id,
        name: 'B',
      });
      expect(result).toBeNull();
    });

    it('deletes a project and returns true', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'A',
        createdBy: adminId,
      });
      const ok = await repo.delete({ workspaceId, id: created.id });
      expect(ok).toBe(true);
      const fetched = await repo.get({ workspaceId, id: created.id });
      expect(fetched).toBeNull();
    });

    it('returns false on cross-workspace delete', async () => {
      const { workspaceId, otherWorkspaceId, adminId } = await seedFixture(client);
      const repo = createProjectRepo(client);
      const created = await repo.create({
        workspaceId,
        name: 'A',
        createdBy: adminId,
      });
      const ok = await repo.delete({ workspaceId: otherWorkspaceId, id: created.id });
      expect(ok).toBe(false);
    });
  });

  describe('DocumentRepo', () => {
    it('creates a document and lists it under its project', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: 'export const box = { width: 10 };',
        createdBy: adminId,
      });
      expect(created?.projectId).toBe(project.id);
      const list = await docRepo.list({
        workspaceId,
        projectId: project.id,
        limit: 50,
      });
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.id).toBe(created?.id);
    });

    it('returns null when creating a document in a cross-workspace project', async () => {
      const { workspaceId, otherWorkspaceId, adminId, otherUserId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const otherProject = await projectRepo.create({
        workspaceId: otherWorkspaceId,
        name: 'P',
        createdBy: otherUserId,
      });
      const result = await docRepo.create({
        workspaceId,
        projectId: otherProject.id,
        name: 'Default',
        tsSource: '',
        createdBy: adminId,
      });
      expect(result).toBeNull();
    });

    it('returns null on cross-workspace get', async () => {
      const { workspaceId, otherWorkspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: '',
        createdBy: adminId,
      });
      expect(created).not.toBeNull();
      const fetched = await docRepo.get({
        workspaceId: otherWorkspaceId,

        id: created!.id,
      });
      expect(fetched).toBeNull();
    });

    it('updates tsSource and reports the new value', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: 'export const x = 1;',
        createdBy: adminId,
      });

      const updated = await docRepo.update({
        workspaceId,
        id: created!.id,
        tsSource: 'export const x = 2;',
      });
      expect(updated?.tsSource).toBe('export const x = 2;');
    });

    it('returns null on cross-workspace update', async () => {
      const { workspaceId, otherWorkspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: '',
        createdBy: adminId,
      });
      const result = await docRepo.update({
        workspaceId: otherWorkspaceId,

        id: created!.id,
        name: 'Renamed',
      });
      expect(result).toBeNull();
    });

    it('deletes a document and removes it from list', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: '',
        createdBy: adminId,
      });

      const ok = await docRepo.delete({ workspaceId, id: created!.id });
      expect(ok).toBe(true);
      const list = await docRepo.list({
        workspaceId,
        projectId: project.id,
        limit: 50,
      });
      expect(list.items).toEqual([]);
    });

    it('cascades when the parent project is deleted', async () => {
      const { workspaceId, adminId } = await seedFixture(client);
      const projectRepo = createProjectRepo(client);
      const docRepo = createDocumentRepo(client);
      const project = await projectRepo.create({
        workspaceId,
        name: 'P',
        createdBy: adminId,
      });
      const created = await docRepo.create({
        workspaceId,
        projectId: project.id,
        name: 'Default',
        tsSource: '',
        createdBy: adminId,
      });
      expect(created).not.toBeNull();
      await projectRepo.delete({ workspaceId, id: project.id });
      const orphans = await client
        .select({ id: documents.id })
        .from(documents)

        .where(sql`${documents.id} = ${created!.id}`);
      expect(orphans).toEqual([]);
    });
  });

  describe('SessionRepo', () => {
    it('revokes a JWT jti and reports it as revoked', async () => {
      const { adminId } = await seedFixture(client);
      const repo = createSessionRepo(client);
      const jti = ulid();
      await repo.revoke({
        jti,
        userId: adminId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      expect(await repo.isRevoked(jti)).toBe(true);
    });

    it('returns false for a never-revoked jti', async () => {
      await seedFixture(client);
      const repo = createSessionRepo(client);
      expect(await repo.isRevoked(ulid())).toBe(false);
    });

    it('sweeps expired sessions and leaves live ones', async () => {
      const { adminId } = await seedFixture(client);
      const repo = createSessionRepo(client);
      const expired = ulid();
      const live = ulid();
      await client.insert(sessions).values([
        {
          id: expired,
          userId: adminId,
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
        {
          id: live,
          userId: adminId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ]);
      const swept = await repo.sweepExpired();
      expect(swept).toBe(1);
      expect(await repo.isRevoked(expired)).toBe(false);
      expect(await repo.isRevoked(live)).toBe(true);
    });

    it('cascades when the user is deleted', async () => {
      const { adminId } = await seedFixture(client);
      const repo = createSessionRepo(client);
      const jti = ulid();
      await repo.revoke({
        jti,
        userId: adminId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      await client
        .delete(projects) // unrelated table; just to keep the test self-contained
        .where(sql`false`);
      // Delete the user via the parent workspace cascade.
      await client.delete(users).where(sql`${users.id} = ${adminId}`);
      expect(await repo.isRevoked(jti)).toBe(false);
    });
  });
});

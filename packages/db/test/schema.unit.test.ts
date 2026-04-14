/**
 * Unit tests for the Drizzle schema definition.
 *
 * No live database — the goal is to assert the schema files
 * compile, the barrel re-exports every table, and the inferred
 * types match the column shapes we expect downstream code (Wave B1
 * repositories) to consume.
 *
 * Real round-trip tests against a Testcontainers Postgres land in
 * Wave B1 as `*.int.test.ts` files gated on `INTEGRATION=1`.
 */

import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  documentVersions,
  documents,
  projects,
  sessions,
  users,
  workspaces,
  type DocumentInsert,
  type ProjectInsert,
  type SessionInsert,
  type UserInsert,
  type WorkspaceInsert,
} from '../src/schema/index.js';

describe('schema barrel', () => {
  it('re-exports every table', () => {
    expect(workspaces).toBeDefined();
    expect(users).toBeDefined();
    expect(projects).toBeDefined();
    expect(documents).toBeDefined();
    expect(documentVersions).toBeDefined();
    expect(sessions).toBeDefined();
  });

  it.each([
    ['workspaces', workspaces, 'workspaces'],
    ['users', users, 'users'],
    ['projects', projects, 'projects'],
    ['documents', documents, 'documents'],
    ['document_versions', documentVersions, 'document_versions'],
    ['sessions', sessions, 'sessions'],
  ])('table %s maps to the expected SQL name', (_label, table, sqlName) => {
    // `getTableName` is Drizzle's public introspection API. Calling
    // it proves the table object is fully constructed and will
    // round-trip to the expected SQL identifier.
    expect(getTableName(table)).toBe(sqlName);
  });
});

describe('inferred insert types', () => {
  it('Workspace insert requires id and name (createdAt has a default)', () => {
    const insert: WorkspaceInsert = { id: '01HQ', name: 'default' };
    expect(insert.id).toBe('01HQ');
  });

  it('User insert requires id, workspaceId, email, passwordHash, role', () => {
    const insert: UserInsert = {
      id: '01HQ',
      workspaceId: '01HW',
      email: 'admin@example.test',
      passwordHash: '$argon2id$...',
      role: 'admin',
    };
    expect(insert.role).toBe('admin');
  });

  it('Project insert requires id, workspaceId, name, createdBy', () => {
    const insert: ProjectInsert = {
      id: '01HQ',
      workspaceId: '01HW',
      name: 'Smoke Test',
      createdBy: '01HU',
    };
    expect(insert.name).toBe('Smoke Test');
  });

  it('Document insert requires id, projectId, name, createdBy', () => {
    const insert: DocumentInsert = {
      id: '01HQ',
      projectId: '01HP',
      name: 'Default',
      createdBy: '01HU',
    };
    expect(insert.name).toBe('Default');
  });

  it('Session insert requires id, userId, expiresAt', () => {
    const insert: SessionInsert = {
      id: '01HJ',
      userId: '01HU',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    expect(insert.userId).toBe('01HU');
  });
});

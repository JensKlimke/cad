import { describe, expect, it, vi } from 'vitest';

import { seedOnFirstBoot } from '../src/services/seeder.js';

import type { Env } from '../src/config/env.js';

const env = {
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_INITIAL_PASSWORD: 'correct horse battery staple',
} as Env;

function createDb(existingCount: string) {
  const insertedRows: unknown[] = [];
  const tx = {
    execute: vi.fn(async () => ({ rows: [{ count: existingCount }] })),
    insert: vi.fn(() => ({
      values: vi.fn(async (row: unknown) => {
        insertedRows.push(row);
      }),
    })),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  return { db, tx, insertedRows };
}

describe('seedOnFirstBoot', () => {
  it('does nothing when a workspace already exists', async () => {
    const { db, tx, insertedRows } = createDb('1');
    const result = await seedOnFirstBoot(db as never, env);

    expect(result).toEqual({
      seeded: false,
      workspaceId: undefined,
      adminUserId: undefined,
    });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(insertedRows).toEqual([]);
  });

  it('creates the default workspace and admin user on an empty database', async () => {
    const { db, tx, insertedRows } = createDb('0');
    const result = await seedOnFirstBoot(db as never, env);

    expect(result.seeded).toBe(true);
    expect(result.workspaceId).toBeDefined();
    expect(result.adminUserId).toBeDefined();
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(insertedRows[0]).toMatchObject({
      id: result.workspaceId,
      name: 'default',
    });
    expect(insertedRows[1]).toMatchObject({
      id: result.adminUserId,
      workspaceId: result.workspaceId,
      email: 'admin@example.test',
      role: 'admin',
    });
    expect((insertedRows[1] as { passwordHash: string }).passwordHash).not.toBe(
      env.ADMIN_INITIAL_PASSWORD,
    );
  });
});

/**
 * First-boot seeder.
 *
 * `seedOnFirstBoot(db, env)` runs inside a transaction at server
 * startup. If the workspaces table is empty, it creates the
 * default workspace and the seeded admin user. Otherwise it is a
 * no-op.
 *
 * Idempotent across restarts: seeding is gated on a row count, not
 * a flag file or env var. Pointing the server at a populated
 * database (e.g. after an upgrade) is safe.
 */

import { type DbClient, ulid } from '@cad/db';
import { users, workspaces } from '@cad/db/schema';
import { sql } from 'drizzle-orm';

import { hashPassword } from './auth.js';

import type { Env } from '../config/env.js';

export interface SeedResult {
  readonly seeded: boolean;
  readonly workspaceId: string | undefined;
  readonly adminUserId: string | undefined;
}

/**
 * Seed the default workspace + admin user on first boot.
 * Re-running against a populated database is a no-op.
 */
export async function seedOnFirstBoot(db: DbClient, env: Env): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const countRows = await tx.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM ${workspaces}`,
    );
    const existing = Number.parseInt(countRows.rows[0]?.count ?? '0', 10);
    if (existing > 0) {
      return { seeded: false, workspaceId: undefined, adminUserId: undefined };
    }

    const workspaceId = ulid();
    await tx.insert(workspaces).values({ id: workspaceId, name: 'default' });

    const passwordHash = await hashPassword(env.ADMIN_INITIAL_PASSWORD);
    const adminUserId = ulid();
    await tx.insert(users).values({
      id: adminUserId,
      workspaceId,
      email: env.ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
    });

    return { seeded: true, workspaceId, adminUserId };
  });
}

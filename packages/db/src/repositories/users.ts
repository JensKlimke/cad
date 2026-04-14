/**
 * User repository.
 *
 * Every lookup is scoped by `workspaceId` so workspace isolation
 * is enforced at the data layer, not just at the route layer. The
 * password column is stored as an argon2id hash; the repository
 * itself never hashes — that is the auth service's job (Wave B2).
 */

import { and, eq } from 'drizzle-orm';

import { ulid } from '../ids.js';
import { users, type User, type UserInsert } from '../schema/users.js';

import type { DbClient } from '../client.js';

export interface FindUserByEmailArgs {
  readonly workspaceId: string;
  readonly email: string;
}

export interface CreateUserArgs {
  readonly workspaceId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: 'admin' | 'member';
}

export interface UpdatePasswordArgs {
  readonly userId: string;
  readonly passwordHash: string;
}

export interface UserRepo {
  /** Look up a user by email within a workspace. Case-insensitive (citext). */
  findByEmail(args: FindUserByEmailArgs): Promise<User | null>;
  /** Look up a user by id, scoped to a workspace. */
  findById(args: { workspaceId: string; userId: string }): Promise<User | null>;
  /** Insert a new user. Throws on email collision (`users_email_workspace_uq`). */
  create(args: CreateUserArgs): Promise<User>;
  /** Replace the password hash for an existing user. Returns `false` if missing. */
  updatePassword(args: UpdatePasswordArgs): Promise<boolean>;
}

export function createUserRepo(db: DbClient): UserRepo {
  return {
    async findByEmail({ workspaceId, email }) {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.workspaceId, workspaceId), eq(users.email, email)))
        .limit(1);
      return rows[0] ?? null;
    },

    async findById({ workspaceId, userId }) {
      const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.workspaceId, workspaceId), eq(users.id, userId)))
        .limit(1);
      return rows[0] ?? null;
    },

    async create({ workspaceId, email, passwordHash, role }) {
      const insert: UserInsert = {
        id: ulid(),
        workspaceId,
        email,
        passwordHash,
        role,
      };
      const [row] = await db.insert(users).values(insert).returning();
      if (row === undefined) {
        throw new Error('users.create: insert returned no rows');
      }
      return row;
    },

    async updatePassword({ userId, passwordHash }) {
      const result = await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
      return result.length > 0;
    },
  };
}

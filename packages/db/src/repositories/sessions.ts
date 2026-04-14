/**
 * Session revocation repository.
 *
 * The Slice 1 auth model is "JWT in HTTP-only cookie + revocation
 * table". Logged-out sessions, password-changed users, and
 * admin-revoked sessions get inserted here keyed by JWT `jti`.
 * The auth middleware rejects any JWT whose `jti` appears in this
 * table and has not yet expired.
 *
 * The `id` column IS the JWT `jti` — passing it as the row id keeps
 * lookup to a primary-key scan.
 */

import { eq, lt, sql } from 'drizzle-orm';

import { sessions, type Session } from '../schema/sessions.js';

import type { DbClient } from '../client.js';

export interface RevokeSessionArgs {
  readonly jti: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export interface SessionRepo {
  /** Insert a row marking the JWT `jti` as revoked. */
  revoke(args: RevokeSessionArgs): Promise<Session>;
  /** True if the JWT `jti` is in the revocation table and has not yet expired. */
  isRevoked(jti: string): Promise<boolean>;
  /** Delete every row whose `expires_at` is in the past. Returns the count. */
  sweepExpired(): Promise<number>;
}

export function createSessionRepo(db: DbClient): SessionRepo {
  return {
    async revoke({ jti, userId, expiresAt }) {
      const [row] = await db.insert(sessions).values({ id: jti, userId, expiresAt }).returning();
      if (row === undefined) {
        throw new Error('sessions.revoke: insert returned no rows');
      }
      return row;
    },

    async isRevoked(jti) {
      const rows = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.id, jti))
        .limit(1);
      return rows.length > 0;
    },

    async sweepExpired() {
      const result = await db
        .delete(sessions)
        .where(lt(sessions.expiresAt, sql`now()`))
        .returning({ id: sessions.id });
      return result.length;
    },
  };
}

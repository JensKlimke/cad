/**
 * `sessions` table — server-side JWT revocation list.
 *
 * The Slice 1 auth model is "JWT in HTTP-only cookie + revocation
 * table". Logged-out sessions, password-changed users, and
 * admin-revoked sessions get inserted into this table by `jti`
 * with `expires_at = jwt.exp`. The auth middleware rejects any JWT
 * whose `jti` appears here.
 *
 * The table is bounded in size: rows expire when their `expires_at`
 * passes, and a nightly sweep (added in Slice 12 alongside the
 * pg_cron entry) deletes expired rows in batches.
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.js';

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('sessions_expires_at_idx').on(table.expiresAt)],
);

export type Session = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

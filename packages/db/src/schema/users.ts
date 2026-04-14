/**
 * `users` table — local-user authentication for Slice 1.
 *
 * Email is stored as `citext` (created via the `citext` extension
 * in `deploy/compose/postgres-init/01-extensions.sql`) so login
 * lookups stay constant-time without a custom `lower(email)` index.
 *
 * `password_hash` holds an argon2id digest. The OIDC stub from
 * Slice 1 W7 is never reached in this slice; when Slice 12 wires
 * a real IdP, this column becomes nullable for users who only
 * authenticate via OIDC. For now it is required.
 */

import { customType, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { workspaces } from './workspaces.js';

const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'citext';
  },
});

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_workspace_uq').on(table.workspaceId, table.email)],
);

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

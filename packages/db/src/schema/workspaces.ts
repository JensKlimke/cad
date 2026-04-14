/**
 * `workspaces` table — the top-level tenant boundary.
 *
 * Slice 1 ships single-workspace v1: there is exactly one row in
 * production. The table exists from day one so that future
 * multi-tenant work is purely additive (every other table already
 * carries a `workspace_id` foreign key, every repository scopes on
 * it, and every route reads it from the authenticated user). When
 * Slice 12 introduces real multi-tenancy, no schema migration is
 * needed beyond seeding additional rows.
 */

import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;

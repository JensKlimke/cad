/**
 * `projects` table — top-level container for documents.
 *
 * Workspace scoping is enforced at the repository layer (see
 * `repositories/projects.ts`, lands in Wave B1) so every query
 * scopes on `workspace_id`. Cursor pagination uses
 * `(created_at desc, id desc)`; the composite index makes that a
 * single index scan.
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { users } from './users.js';
import { workspaces } from './workspaces.js';

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('projects_workspace_created_at_idx').on(table.workspaceId, table.createdAt)],
);

export type Project = typeof projects.$inferSelect;
export type ProjectInsert = typeof projects.$inferInsert;

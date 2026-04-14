/**
 * `documents` table — the canonical TypeScript source of a
 * parametric model.
 *
 * `ts_source` is a plain `text` column (not `jsonb`). The Zod
 * schema in `@cad/protocol` enforces a 256 KB soft cap so a runaway
 * client cannot bloat row width. Larger documents become
 * MinIO-backed blobs starting in Slice 2.
 *
 * `head_version_id` points at the latest committed version in
 * `document_versions`. It is nullable because new documents have no
 * version history yet — the first save creates the first row.
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { projects } from './projects.js';
import { users } from './users.js';

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tsSource: text('ts_source').notNull().default(''),
    headVersionId: text('head_version_id'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('documents_project_created_at_idx').on(table.projectId, table.createdAt)],
);

export type Document = typeof documents.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;

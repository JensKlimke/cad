/**
 * `document_versions` table — append-only history of a document's
 * `ts_source`.
 *
 * Slice 1 only writes the head version (the latest snapshot) on
 * every document update. Real version branching, diffing, and
 * checkout land in Slice 12 alongside the API surface hardening.
 *
 * The forward-compatible shape exists today so downstream slices
 * never need a destructive migration — they only need to start
 * appending rows.
 */

import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { documents } from './documents.js';
import { users } from './users.js';

export const documentVersions = pgTable(
  'document_versions',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tsSourceAtVersion: text('ts_source_at_version').notNull(),
    message: text('message'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('document_versions_document_created_at_idx').on(table.documentId, table.createdAt),
  ],
);

export type DocumentVersion = typeof documentVersions.$inferSelect;
export type DocumentVersionInsert = typeof documentVersions.$inferInsert;

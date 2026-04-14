/**
 * Document repository.
 *
 * Documents are scoped to a project. Workspace isolation is
 * enforced indirectly: every method requires both `workspaceId`
 * and `projectId`, and the query joins on the parent project to
 * verify the project lives in the requested workspace. A document
 * lookup that crosses workspace boundaries returns `null`.
 *
 * `tsSource` updates also bump `updatedAt`.
 */

import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { ulid } from '../ids.js';
import { documents, type Document, type DocumentInsert } from '../schema/documents.js';
import { projects } from '../schema/projects.js';

import type { DbClient } from '../client.js';

export interface ListDocumentsArgs {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface ListDocumentsResult {
  readonly items: Document[];
  readonly nextCursor: string | undefined;
}

export interface CreateDocumentArgs {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly name: string;
  readonly tsSource: string;
  readonly createdBy: string;
}

export interface UpdateDocumentArgs {
  readonly workspaceId: string;
  readonly id: string;
  readonly name?: string;
  readonly tsSource?: string;
}

export interface DocumentRepo {
  list(args: ListDocumentsArgs): Promise<ListDocumentsResult>;
  get(args: { workspaceId: string; id: string }): Promise<Document | null>;
  create(args: CreateDocumentArgs): Promise<Document | null>;
  update(args: UpdateDocumentArgs): Promise<Document | null>;
  delete(args: { workspaceId: string; id: string }): Promise<boolean>;
}

/** Inner-join filter: row's project belongs to the target workspace. */
function workspaceProjectGuard(workspaceId: string, projectId: string) {
  return and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId));
}

export function createDocumentRepo(db: DbClient): DocumentRepo {
  return {
    async list({ workspaceId, projectId, limit, cursor }) {
      // First confirm the project belongs to the workspace; if not,
      // return an empty page so the API layer surfaces a 404 on the
      // parent project instead of leaking documents.
      const parent = await db
        .select({ id: projects.id })
        .from(projects)
        .where(workspaceProjectGuard(workspaceId, projectId))
        .limit(1);
      if (parent.length === 0) {
        return { items: [], nextCursor: undefined };
      }

      const baseFilter = eq(documents.projectId, projectId);
      const rows: Document[] = await (async () => {
        if (cursor === undefined) {
          return db
            .select()
            .from(documents)
            .where(baseFilter)
            .orderBy(desc(documents.createdAt), desc(documents.id))
            .limit(limit + 1);
        }
        const cursorRow = await db
          .select({ createdAt: documents.createdAt, id: documents.id })
          .from(documents)
          .where(and(baseFilter, eq(documents.id, cursor)))
          .limit(1);
        const cursorEntry = cursorRow[0];
        if (cursorEntry === undefined) {
          return [];
        }
        return db
          .select()
          .from(documents)
          .where(
            and(
              baseFilter,
              or(
                lt(documents.createdAt, cursorEntry.createdAt),
                and(
                  eq(documents.createdAt, cursorEntry.createdAt),
                  lt(documents.id, cursorEntry.id),
                ),
              ),
            ),
          )
          .orderBy(desc(documents.createdAt), desc(documents.id))
          .limit(limit + 1);
      })();

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items.at(-1)?.id : undefined;
      return { items, nextCursor };
    },

    async get({ workspaceId, id }) {
      const rows = await db
        .select({
          id: documents.id,
          projectId: documents.projectId,
          name: documents.name,
          tsSource: documents.tsSource,
          headVersionId: documents.headVersionId,
          createdBy: documents.createdBy,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .innerJoin(projects, eq(documents.projectId, projects.id))
        .where(and(eq(projects.workspaceId, workspaceId), eq(documents.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },

    async create({ workspaceId, projectId, name, tsSource, createdBy }) {
      // Guard: parent project must exist in the requested workspace.
      const parent = await db
        .select({ id: projects.id })
        .from(projects)
        .where(workspaceProjectGuard(workspaceId, projectId))
        .limit(1);
      if (parent.length === 0) {
        return null;
      }
      const insert: DocumentInsert = {
        id: ulid(),
        projectId,
        name,
        tsSource,
        createdBy,
      };
      const [row] = await db.insert(documents).values(insert).returning();
      if (row === undefined) {
        throw new Error('documents.create: insert returned no rows');
      }
      return row;
    },

    async update({ workspaceId, id, name, tsSource }) {
      // Guard: load the document via the workspace-aware get path.
      const existing = await db
        .select({ id: documents.id })
        .from(documents)
        .innerJoin(projects, eq(documents.projectId, projects.id))
        .where(and(eq(projects.workspaceId, workspaceId), eq(documents.id, id)))
        .limit(1);
      if (existing.length === 0) {
        return null;
      }
      const updates: Partial<{ name: string; tsSource: string }> = {};
      if (name !== undefined) {
        updates.name = name;
      }
      if (tsSource !== undefined) {
        updates.tsSource = tsSource;
      }
      const [row] = await db
        .update(documents)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(documents.id, id))
        .returning();
      return row ?? null;
    },

    async delete({ workspaceId, id }) {
      // Same guard pattern as update.
      const existing = await db
        .select({ id: documents.id })
        .from(documents)
        .innerJoin(projects, eq(documents.projectId, projects.id))
        .where(and(eq(projects.workspaceId, workspaceId), eq(documents.id, id)))
        .limit(1);
      if (existing.length === 0) {
        return false;
      }
      const result = await db
        .delete(documents)
        .where(eq(documents.id, id))
        .returning({ id: documents.id });
      return result.length > 0;
    },
  };
}

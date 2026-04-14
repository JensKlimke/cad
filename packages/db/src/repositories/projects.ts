/**
 * Project repository.
 *
 * Every method scopes on `workspaceId`. Cross-workspace reads
 * return `null` (not 403) so the API layer never leaks the
 * existence of other workspaces' rows. Cursor pagination uses
 * `(created_at desc, id desc)` ordering with a tuple comparison
 * so ties on `created_at` resolve deterministically.
 */

import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { ulid } from '../ids.js';
import { projects, type Project, type ProjectInsert } from '../schema/projects.js';

import type { DbClient } from '../client.js';

export interface ListProjectsArgs {
  readonly workspaceId: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface ListProjectsResult {
  readonly items: Project[];
  readonly nextCursor: string | undefined;
}

export interface CreateProjectArgs {
  readonly workspaceId: string;
  readonly name: string;
  readonly createdBy: string;
}

export interface UpdateProjectArgs {
  readonly workspaceId: string;
  readonly id: string;
  readonly name?: string;
}

export interface ProjectRepo {
  list(args: ListProjectsArgs): Promise<ListProjectsResult>;
  get(args: { workspaceId: string; id: string }): Promise<Project | null>;
  create(args: CreateProjectArgs): Promise<Project>;
  update(args: UpdateProjectArgs): Promise<Project | null>;
  delete(args: { workspaceId: string; id: string }): Promise<boolean>;
}

export function createProjectRepo(db: DbClient): ProjectRepo {
  return {
    async list({ workspaceId, limit, cursor }) {
      const rows: Project[] = await (async () => {
        if (cursor === undefined) {
          return db
            .select()
            .from(projects)
            .where(eq(projects.workspaceId, workspaceId))
            .orderBy(desc(projects.createdAt), desc(projects.id))
            .limit(limit + 1);
        }
        const cursorRow = await db
          .select({ createdAt: projects.createdAt, id: projects.id })
          .from(projects)
          .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, cursor)))
          .limit(1);
        const cursorEntry = cursorRow[0];
        if (cursorEntry === undefined) {
          // Cursor pointed at a row that no longer exists (deleted
          // or in another workspace). Return an empty page so the
          // caller stops paginating instead of looping.
          return [];
        }
        return db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              or(
                lt(projects.createdAt, cursorEntry.createdAt),
                and(eq(projects.createdAt, cursorEntry.createdAt), lt(projects.id, cursorEntry.id)),
              ),
            ),
          )
          .orderBy(desc(projects.createdAt), desc(projects.id))
          .limit(limit + 1);
      })();

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? items.at(-1)?.id : undefined;
      return { items, nextCursor };
    },

    async get({ workspaceId, id }) {
      const rows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },

    async create({ workspaceId, name, createdBy }) {
      const insert: ProjectInsert = {
        id: ulid(),
        workspaceId,
        name,
        createdBy,
      };
      const [row] = await db.insert(projects).values(insert).returning();
      if (row === undefined) {
        throw new Error('projects.create: insert returned no rows');
      }
      return row;
    },

    async update({ workspaceId, id, name }) {
      const updates: Partial<{ name: string; updatedAt: Date }> = { updatedAt: new Date() };
      if (name !== undefined) {
        updates.name = name;
      }
      const [row] = await db
        .update(projects)
        .set({
          ...updates,
          // Drizzle's typed update needs the explicit Date object
          // for the timestamp column.
          updatedAt: sql`now()`,
        })
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
        .returning();
      return row ?? null;
    },

    async delete({ workspaceId, id }) {
      const result = await db
        .delete(projects)
        .where(and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)))
        .returning({ id: projects.id });
      return result.length > 0;
    },
  };
}

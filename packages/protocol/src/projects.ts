/**
 * Project resource schemas.
 *
 * Projects are the top-level container for documents. Workspace
 * scoping is implicit at the route level — every list/read/write
 * scopes on the authenticated user's workspace; the workspace id
 * is never accepted from the client.
 */

import { z } from 'zod';

import { TimestampSchema, UlidSchema } from './common.js';

const ProjectNameSchema = z.string().trim().min(1).max(120);

export const ProjectSchema = z.object({
  id: UlidSchema,
  workspaceId: UlidSchema,
  name: ProjectNameSchema,
  createdBy: UlidSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectRequestSchema = z.object({
  name: ProjectNameSchema,
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.object({
  name: ProjectNameSchema.optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

export const ListProjectsResponseSchema = z.object({
  items: z.array(ProjectSchema),
  nextCursor: UlidSchema.optional(),
});
export type ListProjectsResponse = z.infer<typeof ListProjectsResponseSchema>;

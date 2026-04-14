/**
 * /projects route group.
 *
 * Every endpoint requires authentication and scopes on the
 * caller's `workspaceId`. The repository layer enforces tenant
 * isolation; the routes never trust a workspace id from the
 * request.
 */

import { createProjectRepo } from '@cad/db';
import {
  CreateProjectRequestSchema,
  ListProjectsResponseSchema,
  PageParamsSchema,
  ProjectSchema,
  UlidSchema,
  UpdateProjectRequestSchema,
} from '@cad/protocol';
import { z } from 'zod';

import { notFound, unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const ProjectIdParams = z.object({ id: UlidSchema });

function serializeProject(row: {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): z.infer<typeof ProjectSchema> {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const projectsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/projects',
    {
      schema: {
        querystring: PageParamsSchema,
        response: { 200: ListProjectsResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createProjectRepo(fastify.db);
      const result = await repo.list({
        workspaceId: user.workspaceId,
        limit: request.query.limit,
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      });
      return {
        items: result.items.map((row) => serializeProject(row)),
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      };
    },
  );

  fastify.post(
    '/projects',
    {
      schema: {
        body: CreateProjectRequestSchema,
        response: { 201: ProjectSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createProjectRepo(fastify.db);
      const created = await repo.create({
        workspaceId: user.workspaceId,
        name: request.body.name,
        createdBy: user.userId,
      });
      reply.code(201);
      return serializeProject(created);
    },
  );

  fastify.get(
    '/projects/:id',
    {
      schema: {
        params: ProjectIdParams,
        response: { 200: ProjectSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createProjectRepo(fastify.db);
      const project = await repo.get({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (project === null) {
        throw notFound('project');
      }
      return serializeProject(project);
    },
  );

  fastify.patch(
    '/projects/:id',
    {
      schema: {
        params: ProjectIdParams,
        body: UpdateProjectRequestSchema,
        response: { 200: ProjectSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createProjectRepo(fastify.db);
      const updated = await repo.update({
        workspaceId: user.workspaceId,
        id: request.params.id,
        ...(request.body.name === undefined ? {} : { name: request.body.name }),
      });
      if (updated === null) {
        throw notFound('project');
      }
      return serializeProject(updated);
    },
  );

  fastify.delete(
    '/projects/:id',
    {
      schema: {
        params: ProjectIdParams,
        response: { 204: z.null() },
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createProjectRepo(fastify.db);
      const deleted = await repo.delete({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (!deleted) {
        throw notFound('project');
      }
      reply.code(204);
      return null;
    },
  );
};

/**
 * /documents route group.
 *
 * Documents are scoped to projects, projects to workspaces. Every
 * endpoint requires authentication and the repository layer
 * enforces tenant isolation. Cross-workspace lookups return 404
 * (not 403) to avoid leaking the existence of other workspaces'
 * resources.
 *
 * Artifact endpoints mint short-TTL presigned URLs for direct
 * client → MinIO uploads + downloads. Direct bucket URLs are
 * never exposed.
 */

import { createDocumentRepo, ulid } from '@cad/db';
import {
  ArtifactGetUrlResponseSchema,
  ArtifactPutUrlRequestSchema,
  ArtifactPutUrlResponseSchema,
  CreateDocumentRequestSchema,
  DocumentSchema,
  ListDocumentsResponseSchema,
  PageParamsSchema,
  UlidSchema,
  UpdateDocumentRequestSchema,
} from '@cad/protocol';
import { z } from 'zod';

import { ApiError, notFound, unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const ProjectScopedParams = z.object({ projectId: UlidSchema });
const DocumentIdParams = z.object({ id: UlidSchema });
const ArtifactKeyParams = z.object({
  id: UlidSchema,
  key: z.string().min(1).max(255),
});

function serializeDocument(row: {
  id: string;
  projectId: string;
  name: string;
  tsSource: string;
  headVersionId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): z.infer<typeof DocumentSchema> {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    tsSource: row.tsSource,
    headVersionId: row.headVersionId,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Build the artifact key namespace for a document. */
function artifactKey(documentId: string, filename: string): string {
  return `docs/${documentId}/${ulid()}-${filename}`;
}

/** Verify the supplied artifact key belongs to the document. */
function isKeyForDocument(key: string, documentId: string): boolean {
  return key.startsWith(`docs/${documentId}/`);
}

export const documentsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/projects/:projectId/documents',
    {
      schema: {
        params: ProjectScopedParams,
        querystring: PageParamsSchema,
        response: { 200: ListDocumentsResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const result = await repo.list({
        workspaceId: user.workspaceId,
        projectId: request.params.projectId,
        limit: request.query.limit,
        ...(request.query.cursor === undefined ? {} : { cursor: request.query.cursor }),
      });
      return {
        items: result.items.map((row) => serializeDocument(row)),
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      };
    },
  );

  fastify.post(
    '/projects/:projectId/documents',
    {
      schema: {
        params: ProjectScopedParams,
        body: CreateDocumentRequestSchema,
        response: { 201: DocumentSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const created = await repo.create({
        workspaceId: user.workspaceId,
        projectId: request.params.projectId,
        name: request.body.name,
        tsSource: request.body.tsSource,
        createdBy: user.userId,
      });
      if (created === null) {
        throw notFound('project');
      }
      reply.code(201);
      return serializeDocument(created);
    },
  );

  fastify.get(
    '/documents/:id',
    {
      schema: {
        params: DocumentIdParams,
        response: { 200: DocumentSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const document = await repo.get({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (document === null) {
        throw notFound('document');
      }
      return serializeDocument(document);
    },
  );

  fastify.patch(
    '/documents/:id',
    {
      schema: {
        params: DocumentIdParams,
        body: UpdateDocumentRequestSchema,
        response: { 200: DocumentSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const updated = await repo.update({
        workspaceId: user.workspaceId,
        id: request.params.id,
        ...(request.body.name === undefined ? {} : { name: request.body.name }),
        ...(request.body.tsSource === undefined ? {} : { tsSource: request.body.tsSource }),
      });
      if (updated === null) {
        throw notFound('document');
      }
      return serializeDocument(updated);
    },
  );

  fastify.delete(
    '/documents/:id',
    {
      schema: {
        params: DocumentIdParams,
        response: { 204: z.null() },
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const deleted = await repo.delete({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (!deleted) {
        throw notFound('document');
      }
      reply.code(204);
      return null;
    },
  );

  // ─── Artifact presigned URLs ──────────────────────────────────────
  fastify.post(
    '/documents/:id/artifacts:sign',
    {
      schema: {
        params: DocumentIdParams,
        body: ArtifactPutUrlRequestSchema,
        response: { 200: ArtifactPutUrlResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      // Confirm the document exists in the caller's workspace
      // before minting a URL (otherwise an attacker could
      // brute-force document ids).
      const repo = createDocumentRepo(fastify.db);
      const document = await repo.get({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (document === null) {
        throw notFound('document');
      }
      const key = artifactKey(document.id, request.body.filename);
      const presigned = await fastify.storage.presignPut(key, request.body.contentType);
      return {
        url: presigned.url,
        key,
        expiresAt: presigned.expiresAt.toISOString(),
      };
    },
  );

  fastify.get(
    '/documents/:id/artifacts/:key:sign',
    {
      schema: {
        params: ArtifactKeyParams,
        response: { 200: ArtifactGetUrlResponseSchema },
      },
      preHandler: fastify.requireAuth,
    },
    async (request) => {
      const user = request.user;
      if (user === undefined) {
        throw unauthorized();
      }
      const repo = createDocumentRepo(fastify.db);
      const document = await repo.get({
        workspaceId: user.workspaceId,
        id: request.params.id,
      });
      if (document === null) {
        throw notFound('document');
      }
      if (!isKeyForDocument(request.params.key, document.id)) {
        // Reject keys that don't carry this document's prefix —
        // prevents one document from minting a URL for another's
        // artifacts.
        throw new ApiError({
          code: 'documents.invalid_artifact_key',
          message: 'The artifact key does not belong to this document.',
          statusCode: 400,
        });
      }
      const presigned = await fastify.storage.presignGet(request.params.key);
      return {
        url: presigned.url,
        expiresAt: presigned.expiresAt.toISOString(),
      };
    },
  );
};

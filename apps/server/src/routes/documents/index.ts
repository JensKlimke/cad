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
  type BuildDocumentFailureDetails,
  type BuildDocumentResponse,
  BuildDocumentResponseSchema,
  CreateDocumentRequestSchema,
  DocumentBuildEventSchema,
  DocumentSchema,
  ListDocumentsResponseSchema,
  PageParamsSchema,
  UlidSchema,
  UpdateDocumentRequestSchema,
} from '@cad/protocol';
import { executeDocument, exportBuildResultAsStl, RuntimeBuildError, type RuntimeBuildResult } from '@cad/runtime';
import { z } from 'zod';

import { ApiError, buildFailed, notFound, unauthorized } from '../../errors.js';

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

const ProjectScopedParams = z.object({ projectId: UlidSchema });
const DocumentIdParams = z.object({ id: UlidSchema });
const ArtifactKeyQuery = z.object({
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

function serializeBuildResponse(
  documentId: string,
  artifactKey: string,
  artifactUrl: string,
  artifactExpiresAt: string,
  build: RuntimeBuildResult,
): BuildDocumentResponse {
  return {
    documentId,
    artifactKey,
    artifactUrl,
    artifactExpiresAt,
    build: {
      documentHash: build.documentHash,
      parameterOrder: [...build.parameterOrder],
      parameters: Object.fromEntries(
        Object.entries(build.parameters).map(([name, value]) => [
          name,
          {
            name: value.name,
            value: value.value,
            unit: value.unit,
            source:
              'value' in value.source
                ? {
                    kind: 'number' as const,
                    value: value.source.value,
                    unit: value.source.unit,
                  }
                : {
                    kind: 'expression' as const,
                    expression: value.source.expression,
                    unit: value.source.unit,
                  },
          },
        ]),
      ),
      features: build.features.map((feature) =>
        feature.kind === 'sketch'
          ? {
              id: feature.id,
              kind: feature.kind,
              inputHash: feature.inputHash,
              cached: feature.cached,
              sketch: {
                plane: feature.sketch.plane,
                svg: feature.sketch.svg,
                geometry: feature.sketch.geometry,
                constraints: feature.sketch.constraints,
                dimensions: feature.sketch.dimensions,
                status: feature.sketch.status,
                diagnostics: [...feature.sketch.diagnostics],
              },
            }
          : {
              id: feature.id,
              kind: feature.kind,
              inputHash: feature.inputHash,
              cached: feature.cached,
              pad: feature.pad,
            },
      ),
      tessellation:
        build.tessellation === null
          ? null
          : {
              positions: [...build.tessellation.positions],
              normals: [...build.tessellation.normals],
              indices: [...build.tessellation.indices],
              metadata: {
                hash: build.tessellation.metadata.hash,
                triangleCount: build.tessellation.metadata.triangleCount,
                vertexCount: build.tessellation.metadata.vertexCount,
                bbox: {
                  min: [...build.tessellation.metadata.bbox.min] as [number, number, number],
                  max: [...build.tessellation.metadata.bbox.max] as [number, number, number],
                },
              },
            },
    },
  };
}

function serializeRuntimeDiagnostics(
  diagnostics: readonly {
    readonly code: string;
    readonly message: string;
    readonly range?: { readonly start: number; readonly end: number };
    readonly path?: readonly string[];
    readonly context?: Readonly<Record<string, string | number | boolean>>;
  }[],
): BuildDocumentFailureDetails['diagnostics'] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.range === undefined ? {} : { range: { ...diagnostic.range } }),
    ...(diagnostic.path === undefined ? {} : { path: [...diagnostic.path] }),
    ...(diagnostic.context === undefined ? {} : { context: { ...diagnostic.context } }),
  }));
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
    '/documents/:id/artifacts:sign',
    {
      schema: {
        params: DocumentIdParams,
        querystring: ArtifactKeyQuery,
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
      if (!isKeyForDocument(request.query.key, document.id)) {
        // Reject keys that don't carry this document's prefix —
        // prevents one document from minting a URL for another's
        // artifacts. Keys are opaque to the client; crossing them
        // here catches both bugs and directory-traversal attempts.
        throw new ApiError({
          code: 'documents.invalid_artifact_key',
          message: 'The artifact key does not belong to this document.',
          statusCode: 400,
        });
      }
      const presigned = await fastify.storage.presignGet(request.query.key);
      return {
        url: presigned.url,
        expiresAt: presigned.expiresAt.toISOString(),
      };
    },
  );

  fastify.get(
    '/documents/:id/events',
    {
      schema: {
        params: DocumentIdParams,
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
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

      reply.hijack();
      reply.raw.writeHead(200, {
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
      });
      reply.raw.write(': connected\n\n');

      const unsubscribe = fastify.documentEvents.subscribe(document.id, (event) => {
        const payload = DocumentBuildEventSchema.parse(event);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      });
      const heartbeat = globalThis.setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 15_000);
      heartbeat.unref?.();

      const cleanup = (): void => {
        globalThis.clearInterval(heartbeat);
        unsubscribe();
        reply.raw.off('close', cleanup);
        reply.raw.off('error', cleanup);
      };

      reply.raw.on('close', cleanup);
      reply.raw.on('error', cleanup);
      return reply;
    },
  );

  fastify.post(
    '/documents/:id/build',
    {
      schema: {
        params: DocumentIdParams,
        response: { 200: BuildDocumentResponseSchema },
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
      fastify.documentEvents.publish({
        type: 'documents.build.running',
        payload: {
          documentId: document.id,
        },
      });
      let build;
      try {
        build = await executeDocument(document.tsSource);
      } catch (error) {
        if (error instanceof RuntimeBuildError) {
          const diagnostics = serializeRuntimeDiagnostics(error.diagnostics);
          fastify.documentEvents.publish({
            type: 'documents.build.failed',
            payload: {
              documentId: document.id,
              message: error.message,
              diagnostics,
            },
          });
          throw buildFailed(error.message, 422, {
            diagnostics,
          } satisfies BuildDocumentFailureDetails);
        }
        fastify.documentEvents.publish({
          type: 'documents.build.failed',
          payload: {
            documentId: document.id,
            message: error instanceof Error ? error.message : String(error),
            diagnostics: [],
          },
        });
        throw buildFailed(error instanceof Error ? error.message : String(error));
      }
      const key = `builds/${document.id}/${ulid()}.json`;
      await fastify.storage.putObject(key, JSON.stringify(build, null, 2), 'application/json');
      const presigned = await fastify.storage.presignGet(key);
      const response = serializeBuildResponse(
        document.id,
        key,
        presigned.url,
        presigned.expiresAt.toISOString(),
        build,
      );
      fastify.documentEvents.publish({
        type: 'documents.build.ready',
        payload: response,
      });
      return response;
    },
  );

  fastify.get(
    '/documents/:id/export/stl',
    {
      schema: {
        params: DocumentIdParams,
      },
      preHandler: fastify.requireAuth,
    },
    async (request, reply) => {
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
      let build;
      try {
        build = await executeDocument(document.tsSource);
      } catch (error) {
        if (error instanceof RuntimeBuildError) {
          throw buildFailed(error.message, 422, {
            diagnostics: serializeRuntimeDiagnostics(error.diagnostics),
          } satisfies BuildDocumentFailureDetails);
        }
        throw buildFailed(error instanceof Error ? error.message : String(error));
      }
      const stl = exportBuildResultAsStl(build);
      reply.header('content-type', 'model/stl');
      reply.header('content-disposition', `attachment; filename="${document.name}.stl"`);
      return Buffer.from(stl);
    },
  );
};

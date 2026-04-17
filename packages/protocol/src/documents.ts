/**
 * Document resource schemas.
 *
 * Documents hold the canonical TypeScript source for a parametric
 * model — the same source Monaco edits and the authoring layer
 * patches via AST codemods (Slice 4 onward). Slice 1 only ships the
 * persistence + lifecycle plumbing; the runtime that actually
 * compiles `tsSource` lands in Slice 2.
 *
 * Document blob artifacts (tessellation cache, thumbnails) live in
 * MinIO and are reached via short-TTL pre-signed URLs minted by the
 * server. Direct bucket URLs are never exposed.
 */

import { z } from 'zod';

import { TimestampSchema, UlidSchema } from './common.js';

const DocumentNameSchema = z.string().trim().min(1).max(120);

/**
 * Soft cap on document `tsSource` payload size — 256 KB. Larger
 * sources should land as MinIO blobs starting in Slice 2; the cap
 * exists today so a runaway client can't bloat Postgres rows.
 */
const TsSourceSchema = z.string().max(256 * 1024);

export const DocumentSchema = z.object({
  id: UlidSchema,
  projectId: UlidSchema,
  name: DocumentNameSchema,
  tsSource: TsSourceSchema,
  headVersionId: UlidSchema.nullable(),
  createdBy: UlidSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Document = z.infer<typeof DocumentSchema>;

export const CreateDocumentRequestSchema = z.object({
  name: DocumentNameSchema,
  tsSource: TsSourceSchema.default(''),
});
export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequestSchema>;

export const UpdateDocumentRequestSchema = z.object({
  name: DocumentNameSchema.optional(),
  tsSource: TsSourceSchema.optional(),
});
export type UpdateDocumentRequest = z.infer<typeof UpdateDocumentRequestSchema>;

export const ListDocumentsResponseSchema = z.object({
  items: z.array(DocumentSchema),
  nextCursor: UlidSchema.optional(),
});
export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>;

export const ArtifactPutUrlRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(255),
});
export type ArtifactPutUrlRequest = z.infer<typeof ArtifactPutUrlRequestSchema>;

export const ArtifactPutUrlResponseSchema = z.object({
  url: z.url(),
  key: z.string(),
  expiresAt: TimestampSchema,
});
export type ArtifactPutUrlResponse = z.infer<typeof ArtifactPutUrlResponseSchema>;

export const ArtifactGetUrlResponseSchema = z.object({
  url: z.url(),
  expiresAt: TimestampSchema,
});
export type ArtifactGetUrlResponse = z.infer<typeof ArtifactGetUrlResponseSchema>;

const UnitSchema = z.enum(['mm', 'deg', 'rad', 'count']);

export const RuntimeDiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  range: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .optional(),
  path: z.array(z.string()).optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export type RuntimeDiagnostic = z.infer<typeof RuntimeDiagnosticSchema>;

export const ResolvedParameterSchema = z.object({
  name: z.string(),
  value: z.number().finite(),
  unit: UnitSchema,
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('number'),
      value: z.number().finite(),
      unit: UnitSchema,
    }),
    z.object({
      kind: z.literal('expression'),
      expression: z.string(),
      unit: UnitSchema,
    }),
  ]),
});
export type ResolvedParameter = z.infer<typeof ResolvedParameterSchema>;

export const RuntimeFeatureResultSchema = z.object({
  id: z.string(),
  kind: z.enum(['pad', 'sketch']),
  inputHash: z.string().length(64),
  cached: z.boolean(),
});
export type RuntimeFeatureResult = z.infer<typeof RuntimeFeatureResultSchema>;

export const JsonTessellationSchema = z.object({
  positions: z.array(z.number().finite()),
  normals: z.array(z.number().finite()),
  indices: z.array(z.number().int().nonnegative()),
  metadata: z.object({
    hash: z.string().length(64),
    triangleCount: z.number().int().nonnegative(),
    vertexCount: z.number().int().nonnegative(),
    bbox: z.object({
      min: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
      max: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    }),
  }),
});
export type JsonTessellation = z.infer<typeof JsonTessellationSchema>;

export const BuildDocumentResponseSchema = z.object({
  documentId: UlidSchema,
  artifactKey: z.string(),
  artifactUrl: z.url(),
  artifactExpiresAt: TimestampSchema,
  build: z.object({
    documentHash: z.string().length(64),
    parameterOrder: z.array(z.string()),
    parameters: z.record(z.string(), ResolvedParameterSchema),
    features: z.array(RuntimeFeatureResultSchema),
    tessellation: JsonTessellationSchema,
  }),
});
export type BuildDocumentResponse = z.infer<typeof BuildDocumentResponseSchema>;

export const BuildDocumentFailureDetailsSchema = z.object({
  diagnostics: z.array(RuntimeDiagnosticSchema),
});
export type BuildDocumentFailureDetails = z.infer<typeof BuildDocumentFailureDetailsSchema>;

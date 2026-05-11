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

import { TopologySchema } from '@cad/references';
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
  kind: z.literal('pad'),
  inputHash: z.string().length(64),
  cached: z.boolean(),
  pad: z.object({
    sketch: z.string(),
    length: z.number().finite(),
    direction: z.enum(['up', 'down', 'symmetric']),
  }),
});
export const RuntimeSketchFeatureResultSchema = z.object({
  id: z.string(),
  kind: z.literal('sketch'),
  inputHash: z.string().length(64),
  cached: z.boolean(),
  sketch: z.object({
    plane: z.enum(['xy', 'yz', 'xz']),
    svg: z.string(),
    geometry: z.object({
      kind: z.literal('rectangle'),
      x: z.number().finite(),
      y: z.number().finite(),
      width: z.number().finite(),
      height: z.number().finite(),
    }),
    constraints: z.object({
      kind: z.literal('rectangle'),
      anchor: z.literal('origin'),
      width: z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('literal'),
          value: z.number().finite(),
          unit: z.literal('mm'),
        }),
        z.object({
          kind: z.literal('reference'),
          name: z.string(),
        }),
        z.object({
          kind: z.literal('expression'),
          source: z.string(),
          unit: z.literal('mm'),
        }),
      ]),
      height: z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('literal'),
          value: z.number().finite(),
          unit: z.literal('mm'),
        }),
        z.object({
          kind: z.literal('reference'),
          name: z.string(),
        }),
        z.object({
          kind: z.literal('expression'),
          source: z.string(),
          unit: z.literal('mm'),
        }),
      ]),
    }),
    dimensions: z.object({
      width: z.number().finite(),
      height: z.number().finite(),
    }),
    status: z.enum(['under_constrained', 'fully_constrained', 'over_constrained']),
    diagnostics: z.array(z.string()),
  }),
});
export const RuntimeFeatureResultUnionSchema = z.discriminatedUnion('kind', [
  RuntimeFeatureResultSchema,
  RuntimeSketchFeatureResultSchema,
]);
export type RuntimeFeatureResult = z.infer<typeof RuntimeFeatureResultUnionSchema>;

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
    features: z.array(RuntimeFeatureResultUnionSchema),
    topology: TopologySchema,
    tessellation: JsonTessellationSchema.nullable(),
  }),
});
export type BuildDocumentResponse = z.infer<typeof BuildDocumentResponseSchema>;

export const DocumentBuildRunningEventSchema = z.object({
  type: z.literal('documents.build.running'),
  payload: z.object({
    documentId: UlidSchema,
  }),
});
export type DocumentBuildRunningEvent = z.infer<typeof DocumentBuildRunningEventSchema>;

export const DocumentBuildReadyEventSchema = z.object({
  type: z.literal('documents.build.ready'),
  payload: BuildDocumentResponseSchema,
});
export type DocumentBuildReadyEvent = z.infer<typeof DocumentBuildReadyEventSchema>;

export const DocumentBuildFailedEventSchema = z.object({
  type: z.literal('documents.build.failed'),
  payload: z.object({
    documentId: UlidSchema,
    message: z.string(),
    diagnostics: z.array(RuntimeDiagnosticSchema),
  }),
});
export type DocumentBuildFailedEvent = z.infer<typeof DocumentBuildFailedEventSchema>;

export const DocumentBuildEventSchema = z.discriminatedUnion('type', [
  DocumentBuildRunningEventSchema,
  DocumentBuildReadyEventSchema,
  DocumentBuildFailedEventSchema,
]);
export type DocumentBuildEvent = z.infer<typeof DocumentBuildEventSchema>;

export const BuildDocumentFailureDetailsSchema = z.object({
  diagnostics: z.array(RuntimeDiagnosticSchema),
});
export type BuildDocumentFailureDetails = z.infer<typeof BuildDocumentFailureDetailsSchema>;

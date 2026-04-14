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

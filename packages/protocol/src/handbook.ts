import { z } from 'zod';

export const HandbookLocaleSchema = z.enum(['en', 'de']);
export const HandbookKindSchema = z.enum(['concepts', 'workflows', 'faq', 'features']);

export const HandbookHeadingSchema = z.object({
  depth: z.number().int().min(1).max(6),
  slug: z.string().min(1),
  title: z.string().min(1),
});

export const HandbookPageSummarySchema = z.object({
  kind: HandbookKindSchema,
  slug: z.string().min(1),
  path: z.string().startsWith('/handbook/'),
  title: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)),
  sdkOpId: z.string().min(1).optional(),
  requestedLocale: HandbookLocaleSchema,
  sourceLocale: HandbookLocaleSchema,
  isFallback: z.boolean(),
});

export const HandbookPageSchema = HandbookPageSummarySchema.extend({
  body: z.string().min(1),
  html: z.string().min(1),
  headings: z.array(HandbookHeadingSchema),
});

export const HandbookSearchQuerySchema = z.object({
  q: z.string().min(1),
  locale: HandbookLocaleSchema.optional(),
  kind: HandbookKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const HandbookListQuerySchema = z.object({
  locale: HandbookLocaleSchema.optional(),
  kind: HandbookKindSchema.optional(),
});

export const HandbookByOpParamsSchema = z.object({
  opId: z.string().min(1),
});

export const HandbookPageParamsSchema = z.object({
  kind: HandbookKindSchema,
  slug: z.string().min(1),
});

export const HandbookSearchResponseSchema = z.object({
  items: z.array(HandbookPageSummarySchema),
});

export const HandbookListResponseSchema = z.object({
  items: z.array(HandbookPageSummarySchema),
});

export type HandbookLocale = z.infer<typeof HandbookLocaleSchema>;
export type HandbookKind = z.infer<typeof HandbookKindSchema>;
export type HandbookHeading = z.infer<typeof HandbookHeadingSchema>;
export type HandbookPageSummary = z.infer<typeof HandbookPageSummarySchema>;
export type HandbookPage = z.infer<typeof HandbookPageSchema>;
export type HandbookSearchQuery = z.infer<typeof HandbookSearchQuerySchema>;
export type HandbookListQuery = z.infer<typeof HandbookListQuerySchema>;
export type HandbookPageParams = z.infer<typeof HandbookPageParamsSchema>;
export type HandbookByOpParams = z.infer<typeof HandbookByOpParamsSchema>;
export type HandbookSearchResponse = z.infer<typeof HandbookSearchResponseSchema>;
export type HandbookListResponse = z.infer<typeof HandbookListResponseSchema>;

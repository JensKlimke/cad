/**
 * Round-trip tests for `@cad/protocol/handbook` schemas.
 */

import { describe, expect, it } from 'vitest';

import {
  HandbookByOpParamsSchema,
  HandbookHeadingSchema,
  HandbookKindSchema,
  HandbookListQuerySchema,
  HandbookListResponseSchema,
  HandbookLocaleSchema,
  HandbookPageParamsSchema,
  HandbookPageSchema,
  HandbookPageSummarySchema,
  HandbookSearchQuerySchema,
  HandbookSearchResponseSchema,
} from '../src/handbook.js';

const summaryFixture = {
  kind: 'concepts',
  slug: 'references',
  path: '/handbook/concepts/references',
  title: 'References',
  summary: 'Stable references for generated model topology.',
  tags: ['references', 'topology'],
  sdkOpId: 'createReference',
  requestedLocale: 'en',
  sourceLocale: 'en',
  isFallback: false,
};

describe('HandbookLocaleSchema', () => {
  it('accepts supported locales', () => {
    expect(HandbookLocaleSchema.parse('de')).toBe('de');
  });

  it('rejects unsupported locales', () => {
    expect(() => HandbookLocaleSchema.parse('fr')).toThrow();
  });
});

describe('HandbookKindSchema', () => {
  it('accepts supported page kinds', () => {
    expect(HandbookKindSchema.parse('workflows')).toBe('workflows');
  });
});

describe('HandbookHeadingSchema', () => {
  it('parses a heading with a valid depth', () => {
    const result = HandbookHeadingSchema.parse({
      depth: 2,
      slug: 'repair',
      title: 'Repair references',
    });
    expect(result.depth).toBe(2);
  });

  it('rejects headings outside markdown depth bounds', () => {
    expect(() =>
      HandbookHeadingSchema.parse({ depth: 7, slug: 'too-deep', title: 'Too deep' }),
    ).toThrow();
  });
});

describe('HandbookPageSummarySchema', () => {
  it('parses a page summary', () => {
    expect(HandbookPageSummarySchema.parse(summaryFixture).slug).toBe('references');
  });

  it('rejects paths outside the handbook route', () => {
    expect(() =>
      HandbookPageSummarySchema.parse({
        ...summaryFixture,
        path: '/docs/concepts/references',
      }),
    ).toThrow();
  });
});

describe('HandbookPageSchema', () => {
  it('parses a complete handbook page', () => {
    const result = HandbookPageSchema.parse({
      ...summaryFixture,
      body: '# References',
      html: '<h1>References</h1>',
      headings: [{ depth: 1, slug: 'references', title: 'References' }],
    });
    expect(result.headings[0]?.slug).toBe('references');
  });
});

describe('HandbookSearchQuerySchema', () => {
  it('coerces limit from query-string input', () => {
    const result = HandbookSearchQuerySchema.parse({
      q: 'reference repair',
      locale: 'en',
      kind: 'workflows',
      limit: '10',
    });
    expect(result.limit).toBe(10);
  });

  it('rejects empty search queries', () => {
    expect(() => HandbookSearchQuerySchema.parse({ q: '' })).toThrow();
  });
});

describe('HandbookListQuerySchema', () => {
  it('accepts optional locale and kind filters', () => {
    const result = HandbookListQuerySchema.parse({ locale: 'de', kind: 'features' });
    expect(result.kind).toBe('features');
  });
});

describe('HandbookByOpParamsSchema', () => {
  it('parses an SDK operation id', () => {
    expect(HandbookByOpParamsSchema.parse({ opId: 'pad' }).opId).toBe('pad');
  });
});

describe('HandbookPageParamsSchema', () => {
  it('parses route params for a page', () => {
    const result = HandbookPageParamsSchema.parse({
      kind: 'concepts',
      slug: 'document-model',
    });
    expect(result.slug).toBe('document-model');
  });
});

describe('handbook response schemas', () => {
  it('parses search and list responses', () => {
    expect(HandbookSearchResponseSchema.parse({ items: [summaryFixture] }).items).toHaveLength(1);
    expect(HandbookListResponseSchema.parse({ items: [summaryFixture] }).items).toHaveLength(1);
  });
});

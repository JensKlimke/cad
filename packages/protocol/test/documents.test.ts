/**
 * Round-trip tests for `@cad/protocol/documents` schemas.
 */

import { describe, expect, it } from 'vitest';

import {
  ArtifactGetUrlResponseSchema,
  ArtifactPutUrlRequestSchema,
  ArtifactPutUrlResponseSchema,
  CreateDocumentRequestSchema,
  DocumentSchema,
  ListDocumentsResponseSchema,
  UpdateDocumentRequestSchema,
} from '../src/documents.js';

const VALID_ULID = '01HQ8K3VBRZ8XGRGY5T0WJD8AB';
const ISO = '2026-04-14T10:30:00Z';

const fixture = {
  id: VALID_ULID,
  projectId: VALID_ULID,
  name: 'Default',
  tsSource: 'export const box = { width: 10 };',
  headVersionId: null,
  createdBy: VALID_ULID,
  createdAt: ISO,
  updatedAt: ISO,
};

describe('DocumentSchema', () => {
  it('parses a complete document with null head version', () => {
    expect(DocumentSchema.parse(fixture).headVersionId).toBeNull();
  });

  it('parses a document with a real head version', () => {
    const result = DocumentSchema.parse({ ...fixture, headVersionId: VALID_ULID });
    expect(result.headVersionId).toBe(VALID_ULID);
  });

  it('rejects a tsSource larger than 256 KB', () => {
    const big = 'x'.repeat(256 * 1024 + 1);
    expect(() => DocumentSchema.parse({ ...fixture, tsSource: big })).toThrow();
  });
});

describe('CreateDocumentRequestSchema', () => {
  it('defaults tsSource to an empty string', () => {
    const result = CreateDocumentRequestSchema.parse({ name: 'Default' });
    expect(result.tsSource).toBe('');
  });

  it('accepts a custom tsSource', () => {
    const result = CreateDocumentRequestSchema.parse({
      name: 'Default',
      tsSource: 'export const x = 1;',
    });
    expect(result.tsSource).toBe('export const x = 1;');
  });
});

describe('UpdateDocumentRequestSchema', () => {
  it('accepts an empty update body', () => {
    expect(() => UpdateDocumentRequestSchema.parse({})).not.toThrow();
  });

  it('accepts a partial update', () => {
    const result = UpdateDocumentRequestSchema.parse({ name: 'Renamed' });
    expect(result.name).toBe('Renamed');
    expect(result.tsSource).toBeUndefined();
  });
});

describe('ListDocumentsResponseSchema', () => {
  it('parses an empty list', () => {
    expect(ListDocumentsResponseSchema.parse({ items: [] }).items).toEqual([]);
  });

  it('parses a list with documents', () => {
    expect(ListDocumentsResponseSchema.parse({ items: [fixture] }).items).toHaveLength(1);
  });
});

describe('ArtifactPutUrlRequestSchema', () => {
  it('parses a request with filename + contentType', () => {
    const result = ArtifactPutUrlRequestSchema.parse({
      filename: 'thumbnail.png',
      contentType: 'image/png',
    });
    expect(result.filename).toBe('thumbnail.png');
  });

  it('rejects an empty filename', () => {
    expect(() =>
      ArtifactPutUrlRequestSchema.parse({ filename: '', contentType: 'image/png' }),
    ).toThrow();
  });
});

describe('ArtifactPutUrlResponseSchema', () => {
  it('parses a presigned URL response', () => {
    const result = ArtifactPutUrlResponseSchema.parse({
      url: 'https://minio.test/cad-artifacts/docs/01H/x.png?X-Amz-Signature=abc',
      key: 'docs/01H/x.png',
      expiresAt: ISO,
    });
    expect(result.url).toContain('minio.test');
  });

  it('rejects a non-URL', () => {
    expect(() =>
      ArtifactPutUrlResponseSchema.parse({
        url: 'not-a-url',
        key: 'k',
        expiresAt: ISO,
      }),
    ).toThrow();
  });
});

describe('ArtifactGetUrlResponseSchema', () => {
  it('parses a get-url response', () => {
    const result = ArtifactGetUrlResponseSchema.parse({
      url: 'https://minio.test/cad-artifacts/docs/01H/x.png',
      expiresAt: ISO,
    });
    expect(result.url).toContain('minio.test');
  });
});

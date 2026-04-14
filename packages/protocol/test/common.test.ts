/**
 * Unit tests for the shared primitives in `@cad/protocol/common`.
 *
 * Drives every schema to ≥ 90 % lines / ≥ 85 % branches so the
 * package meets the lib preset coverage gate from the first commit.
 * Each schema gets at least one positive case and one negative
 * case; the error envelope's optional `i18nKey` field — Slice 0b's
 * load-bearing addition — gets explicit coverage.
 */

import { describe, expect, it } from 'vitest';

import {
  EmailSchema,
  ErrorEnvelopeSchema,
  PageParamsSchema,
  TimestampSchema,
  UlidSchema,
} from '../src/common.js';

describe('UlidSchema', () => {
  it.each([
    '01HQ8K3VBRZ8XGRGY5T0WJD8AB',
    '00000000000000000000000000',
    '7ZZZZZZZZZZZZZZZZZZZZZZZZZ',
  ])('accepts a valid Crockford base32 ULID: %s', (value) => {
    expect(() => UlidSchema.parse(value)).not.toThrow();
  });

  it.each([
    ['too short', '01HQ8K3VBRZ8'],
    ['too long', '01HQ8K3VBRZ8XGRGY5T0WJD8AB0'],
    ['lowercase', '01hq8k3vbrz8xgrgy5t0wjd8ab'],
    ['contains I (excluded)', '01HQ8K3VBRZ8XGRGY5T0WJD8AI'],
    ['contains L (excluded)', '01HQ8K3VBRZ8XGRGY5T0WJD8AL'],
    ['contains O (excluded)', '01HQ8K3VBRZ8XGRGY5T0WJD8AO'],
    ['contains U (excluded)', '01HQ8K3VBRZ8XGRGY5T0WJD8AU'],
    ['empty', ''],
  ])('rejects invalid input: %s', (_label, value) => {
    expect(() => UlidSchema.parse(value)).toThrow();
  });

  it('rejects non-string input', () => {
    expect(() => UlidSchema.parse(42)).toThrow();
    expect(() => UlidSchema.parse(null)).toThrow();
  });
});

describe('TimestampSchema', () => {
  it.each(['2026-04-14T10:30:00Z', '2026-04-14T10:30:00+02:00', '2026-04-14T10:30:00.123Z'])(
    'accepts an ISO-8601 timestamp with offset: %s',
    (value) => {
      expect(() => TimestampSchema.parse(value)).not.toThrow();
    },
  );

  it.each([
    ['no timezone', '2026-04-14T10:30:00'],
    ['date only', '2026-04-14'],
    ['garbage', 'not-a-date'],
  ])('rejects invalid timestamp: %s', (_label, value) => {
    expect(() => TimestampSchema.parse(value)).toThrow();
  });
});

describe('PageParamsSchema', () => {
  it('uses the default limit of 50 when nothing is provided', () => {
    const result = PageParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it('coerces a string limit from a query parameter', () => {
    const result = PageParamsSchema.parse({ limit: '25' });
    expect(result.limit).toBe(25);
  });

  it('clamps an out-of-range limit (rejects)', () => {
    expect(() => PageParamsSchema.parse({ limit: 0 })).toThrow();
    expect(() => PageParamsSchema.parse({ limit: 101 })).toThrow();
  });

  it('accepts a valid ULID cursor', () => {
    const result = PageParamsSchema.parse({ cursor: '01HQ8K3VBRZ8XGRGY5T0WJD8AB' });
    expect(result.cursor).toBe('01HQ8K3VBRZ8XGRGY5T0WJD8AB');
  });

  it('rejects a malformed cursor', () => {
    expect(() => PageParamsSchema.parse({ cursor: 'not-a-ulid' })).toThrow();
  });
});

describe('ErrorEnvelopeSchema', () => {
  it('parses an error without i18nKey or details', () => {
    const envelope = {
      error: { code: 'unauthorized', message: 'Sign in required.' },
    };
    const result = ErrorEnvelopeSchema.parse(envelope);
    expect(result.error.code).toBe('unauthorized');
    expect(result.error.i18nKey).toBeUndefined();
    expect(result.error.details).toBeUndefined();
  });

  it('parses an error with i18nKey for client re-translation', () => {
    const envelope = {
      error: {
        code: 'auth.invalid_credentials',
        message: 'Email or password is incorrect.',
        i18nKey: 'errors:auth.invalid_credentials',
      },
      requestId: 'req_01HQ8K3VBRZ8XGRGY5T0WJD8AB',
    };
    const result = ErrorEnvelopeSchema.parse(envelope);
    expect(result.error.i18nKey).toBe('errors:auth.invalid_credentials');
    expect(result.requestId).toBe('req_01HQ8K3VBRZ8XGRGY5T0WJD8AB');
  });

  it('parses an error with structured details', () => {
    const envelope = {
      error: {
        code: 'validation.failed',
        message: 'Request body invalid.',
        details: { field: 'email', reason: 'invalid format' },
      },
    };
    const result = ErrorEnvelopeSchema.parse(envelope);
    expect(result.error.details).toEqual({ field: 'email', reason: 'invalid format' });
  });

  it('rejects an envelope missing the error.code field', () => {
    expect(() => ErrorEnvelopeSchema.parse({ error: { message: 'no code' } })).toThrow();
  });

  it('rejects an envelope missing the error.message field', () => {
    expect(() => ErrorEnvelopeSchema.parse({ error: { code: 'no message' } })).toThrow();
  });
});

describe('EmailSchema', () => {
  it('accepts a valid email', () => {
    expect(() => EmailSchema.parse('admin@example.test')).not.toThrow();
  });

  it('rejects a malformed email', () => {
    expect(() => EmailSchema.parse('not-an-email')).toThrow();
  });

  it('rejects an email longer than 320 chars', () => {
    // 320 'a' + '@x.test' = 327 chars total, which exceeds the 320 cap.
    const long = 'a'.repeat(320) + '@x.test';
    expect(() => EmailSchema.parse(long)).toThrow();
  });
});

/**
 * Unit tests for the canonical error envelope helpers.
 */

import { describe, expect, it } from 'vitest';

import {
  ApiError,
  buildFailed,
  invalidCredentials,
  notFound,
  statusCodeFor,
  toErrorEnvelope,
  unauthorized,
} from '../src/errors.js';

describe('ApiError', () => {
  it('captures every option on the instance', () => {
    const err = new ApiError({
      code: 'projects.not_found',
      message: 'Project not found.',
      statusCode: 404,
      i18nKey: 'errors:projects.not_found',
      details: { id: '01H' },
    });
    expect(err.code).toBe('projects.not_found');
    expect(err.message).toBe('Project not found.');
    expect(err.statusCode).toBe(404);
    expect(err.i18nKey).toBe('errors:projects.not_found');
    expect(err.details).toEqual({ id: '01H' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
  });

  it('omits i18nKey and details when not provided', () => {
    const err = new ApiError({
      code: 'unauthorized',
      message: 'auth required',
      statusCode: 401,
    });
    expect(err.i18nKey).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});

describe('toErrorEnvelope', () => {
  it('serialises an ApiError with i18nKey + requestId', () => {
    const envelope = toErrorEnvelope(invalidCredentials(), 'req-123');
    expect(envelope.error.code).toBe('auth.invalid_credentials');
    expect(envelope.error.i18nKey).toBe('errors:auth.invalid_credentials');
    expect(envelope.requestId).toBe('req-123');
  });

  it('serialises an ApiError with details', () => {
    const err = new ApiError({
      code: 'validation.failed',
      message: 'bad input',
      statusCode: 400,
      details: { field: 'email', reason: 'invalid' },
    });
    const envelope = toErrorEnvelope(err, 'req-abc');
    expect(envelope.error.details).toEqual({ field: 'email', reason: 'invalid' });
  });

  it('omits requestId when not provided', () => {
    const envelope = toErrorEnvelope(invalidCredentials());
    expect(envelope.requestId).toBeUndefined();
  });

  it('serialises an unknown error as the generic internal envelope', () => {
    const envelope = toErrorEnvelope(new Error('boom'), 'req-xyz');
    expect(envelope.error.code).toBe('internal');
    expect(envelope.error.i18nKey).toBe('errors:generic');
    // Never leak the raw error message — it may carry stack frames or PII.
    expect(envelope.error.message).not.toContain('boom');
  });

  it('serialises a non-Error throwable as generic', () => {
    const envelope = toErrorEnvelope('a string');
    expect(envelope.error.code).toBe('internal');
  });

  it('serialises Fastify validation errors with issues and context', () => {
    const envelope = toErrorEnvelope(
      {
        statusCode: 400,
        message: 'body failed validation',
        validation: [{ path: ['name'], message: 'Required' }],
        validationContext: 'body',
      },
      'req-validation',
    );

    expect(envelope).toEqual({
      error: {
        code: 'validation.failed',
        message: 'body failed validation',
        i18nKey: 'errors:validation.failed',
        details: {
          issues: [{ path: ['name'], message: 'Required' }],
          context: 'body',
        },
      },
      requestId: 'req-validation',
    });
  });

  it('serialises 4xx Fastify errors as rejected requests', () => {
    const envelope = toErrorEnvelope({ statusCode: 404, message: 'Route not found' });
    expect(envelope.error).toEqual({
      code: 'request.rejected',
      message: 'Route not found',
      i18nKey: 'errors:request.rejected',
    });
  });
});

describe('statusCodeFor', () => {
  it('honours ApiError and Fastify status codes', () => {
    expect(statusCodeFor(unauthorized())).toBe(401);
    expect(statusCodeFor({ statusCode: 415 })).toBe(415);
    expect(statusCodeFor({ statusCode: 302 })).toBe(500);
    expect(statusCodeFor(null)).toBe(500);
  });
});

describe('error factories', () => {
  it('unauthorized() builds a 401 with the session-expired key', () => {
    const err = unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('unauthorized');
    expect(err.i18nKey).toBe('errors:auth.session_expired');
  });

  it('invalidCredentials() builds a 401 with the invalid-credentials key', () => {
    const err = invalidCredentials();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('auth.invalid_credentials');
  });

  it('notFound("project") builds a 404 with the projects key', () => {
    const err = notFound('project');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('projects.not_found');
    expect(err.i18nKey).toBe('errors:projects.not_found');
  });

  it('notFound("document") builds a 404 with the documents key', () => {
    const err = notFound('document', 'No such document');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('documents.not_found');
    expect(err.message).toBe('No such document');
  });

  it('buildFailed() carries optional structured details', () => {
    const err = buildFailed('Bad CAD source', 409, { diagnostics: ['broken'] });
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('documents.build_failed');
    expect(err.details).toEqual({ diagnostics: ['broken'] });
  });
});

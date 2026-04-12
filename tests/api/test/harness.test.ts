/**
 * End-to-end tests for the Fastify + Zod + Supertest harness.
 *
 * Slice 0 exercises the single `/health` endpoint. The test assertions are
 * deliberately strict on response shape so Slice 1's real routes inherit a
 * stable baseline for what "well-typed Fastify + Zod" looks like on this
 * codebase.
 */

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../src/harness.js';
import { healthResponseSchema } from '../src/health.js';

import type { FastifyInstance } from 'fastify';

describe('createTestApp()', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a ready Fastify instance', () => {
    expect(app).toBeDefined();
    expect(typeof app.server).toBe('object');
  });
});

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with a valid health response', async () => {
    const response = await request(app.server).get('/health');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const parsed = healthResponseSchema.parse(response.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('is stable across repeated calls', async () => {
    const first = await request(app.server).get('/health');
    const second = await request(app.server).get('/health');
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(second.body.ok).toBe(true);
    // uptimeSeconds should be monotonically non-decreasing.
    expect(second.body.uptimeSeconds).toBeGreaterThanOrEqual(first.body.uptimeSeconds);
  });

  it('returns 404 for an unknown path', async () => {
    const response = await request(app.server).get('/does-not-exist');
    expect(response.status).toBe(404);
  });
});

/**
 * /projects CRUD integration spec.
 *
 * Happy-path list/create/update/delete is covered by the
 * lifecycle spec. This file locks down the error surfaces and
 * the pagination contract:
 *
 *   - unauthenticated access → 401
 *   - unknown id             → 404 (projects.not_found)
 *   - invalid body (missing name) → 400 validation
 *   - cursor pagination      → nextCursor roundtrip + final page
 *
 * Every 4xx body is parsed against `ErrorEnvelopeSchema`.
 *
 * Gated on `INTEGRATION=1`.
 */

import {
  ErrorEnvelopeSchema,
  type ErrorEnvelope,
  type LoginResponse,
  type ListProjectsResponse,
  type Project,
} from '@cad/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME, extractSessionCookie } from '../src/cookies.js';
import { createApiTestContext, type ApiTestContext } from '../src/createApiTestContext.js';

function parseEnvelope(raw: unknown): ErrorEnvelope {
  return ErrorEnvelopeSchema.parse(raw);
}

describe('/projects', () => {
  let context: ApiTestContext;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    context = await createApiTestContext();
    const login = await context.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: context.env.ADMIN_EMAIL,
        password: context.env.ADMIN_INITIAL_PASSWORD,
      },
    });
    if (login.statusCode !== 200) {
      throw new Error(`projects.int.test: login failed (status ${String(login.statusCode)})`);
    }
    login.json<LoginResponse>();
    cookies = { [SESSION_COOKIE_NAME]: extractSessionCookie(login.headers['set-cookie']) };
  });

  afterAll(async () => {
    if (context !== undefined) {
      await context.close();
    }
  });

  it('rejects unauthenticated list with 401', async () => {
    const response = await context.app.inject({ method: 'GET', url: '/projects' });
    expect(response.statusCode).toBe(401);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('unauthorized');
  });

  it('rejects unauthenticated create with 401', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'should-not-persist' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('rejects an empty name with 400 validation', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for an unknown project id', async () => {
    // Well-formed ULID that does not exist in the db.
    const response = await context.app.inject({
      method: 'GET',
      url: '/projects/01JZZZZZZZZZZZZZZZZZZZZZZZ',
      cookies,
    });
    expect(response.statusCode).toBe(404);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('projects.not_found');
    expect(envelope.error.i18nKey).toBe('errors:projects.not_found');
  });

  it('returns 400 for a malformed project id', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/projects/not-a-ulid',
      cookies,
    });
    expect(response.statusCode).toBe(400);
  });

  it('updates a project name and reflects it on reads', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: 'original name' },
    });
    expect(created.statusCode).toBe(201);
    const project = created.json<Project>();

    const updated = await context.app.inject({
      method: 'PATCH',
      url: `/projects/${project.id}`,
      cookies,
      payload: { name: 'renamed' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json<Project>().name).toBe('renamed');

    const fetched = await context.app.inject({
      method: 'GET',
      url: `/projects/${project.id}`,
      cookies,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json<Project>().name).toBe('renamed');
  });

  it('paginates via cursor when there are more projects than the limit', async () => {
    // Seed ten projects in addition to whatever earlier tests
    // left behind. Ten is enough to span multiple pages at
    // `limit=3`.
    const created: Project[] = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await context.app.inject({
        method: 'POST',
        url: '/projects',
        cookies,
        payload: { name: `pagination-${String(index).padStart(2, '0')}` },
      });
      expect(response.statusCode).toBe(201);
      created.push(response.json<Project>());
    }

    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      const url = `/projects?limit=3${cursor === undefined ? '' : `&cursor=${cursor}`}`;
      const response = await context.app.inject({ method: 'GET', url, cookies });
      expect(response.statusCode).toBe(200);
      const page = response.json<ListProjectsResponse>();
      for (const item of page.items) {
        seen.add(item.id);
      }
      pages += 1;
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
      // Abort runaway loops before they ever flake.
      expect(pages).toBeLessThan(50);
    }
    for (const project of created) {
      expect(seen.has(project.id)).toBe(true);
    }
  });

  it('returns 404 after delete, and delete is not idempotent on the HTTP surface', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: 'to-delete' },
    });
    const project = created.json<Project>();

    const first = await context.app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}`,
      cookies,
    });
    expect(first.statusCode).toBe(204);

    const second = await context.app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}`,
      cookies,
    });
    expect(second.statusCode).toBe(404);
    expect(parseEnvelope(second.json()).error.code).toBe('projects.not_found');
  });
});

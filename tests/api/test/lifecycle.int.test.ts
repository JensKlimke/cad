/**
 * End-to-end API lifecycle spec.
 *
 * Exercises the happy path that every on-prem install must pass:
 *
 *   1. POST /auth/login          → session cookie issued
 *   2. GET  /auth/me             → identity echoed back
 *   3. POST /projects            → project persisted
 *   4. GET  /projects            → list contains the new project
 *   5. POST /projects/:id/documents → document persisted
 *   6. POST /documents/:id/artifacts:sign → presigned PUT URL
 *   7. direct HTTP PUT to MinIO  → object stored
 *   8. GET  /documents/:id/artifacts:sign?key=… → presigned GET URL
 *   9. direct HTTP GET from MinIO → byte equality
 *  10. DELETE /projects/:id       → cascades to documents
 *  11. GET /documents/:id (post-delete) → 404
 *
 * Gated on `INTEGRATION=1`. Boots Postgres + MinIO once per file
 * via `createApiTestContext()`.
 */

import {
  type ArtifactGetUrlResponse,
  type ArtifactPutUrlResponse,
  type Document,
  type ListProjectsResponse,
  type LoginResponse,
  type MeResponse,
  type Project,
} from '@cad/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME, extractSessionCookie } from '../src/cookies.js';
import { createApiTestContext, type ApiTestContext } from '../src/createApiTestContext.js';

describe('API lifecycle (happy path)', () => {
  let context: ApiTestContext;

  beforeAll(async () => {
    context = await createApiTestContext();
  });

  afterAll(async () => {
    if (context !== undefined) {
      await context.close();
    }
  });

  it('runs the full login → create → upload → download → delete flow', async () => {
    const { app, env } = context;

    // 1. Login ────────────────────────────────────────────────
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_INITIAL_PASSWORD,
      },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json<LoginResponse>();
    expect(loginBody.email).toBe(env.ADMIN_EMAIL);
    expect(loginBody.role).toBe('admin');
    expect(loginBody.userId).toBe(context.adminUserId);
    expect(loginBody.workspaceId).toBe(context.workspaceId);

    const sessionToken = extractSessionCookie(loginResponse.headers['set-cookie']);
    const cookies = { [SESSION_COOKIE_NAME]: sessionToken };

    // 2. /auth/me ─────────────────────────────────────────────
    const meResponse = await app.inject({ method: 'GET', url: '/auth/me', cookies });
    expect(meResponse.statusCode).toBe(200);
    const me = meResponse.json<MeResponse>();
    expect(me.userId).toBe(context.adminUserId);
    expect(me.workspaceId).toBe(context.workspaceId);
    expect(me.email).toBe(env.ADMIN_EMAIL);

    // 3. Create a project ─────────────────────────────────────
    const createProjectResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: 'lifecycle spec project' },
    });
    expect(createProjectResponse.statusCode).toBe(201);
    const project = createProjectResponse.json<Project>();
    expect(project.name).toBe('lifecycle spec project');
    expect(project.workspaceId).toBe(context.workspaceId);
    expect(project.createdBy).toBe(context.adminUserId);

    // 4. List projects ────────────────────────────────────────
    const listProjectsResponse = await app.inject({
      method: 'GET',
      url: '/projects',
      cookies,
    });
    expect(listProjectsResponse.statusCode).toBe(200);
    const list = listProjectsResponse.json<ListProjectsResponse>();
    expect(list.items.map((row) => row.id)).toContain(project.id);

    // 5. Create a document ────────────────────────────────────
    const createDocumentResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: {
        name: 'spec document',
        tsSource: '// initial source',
      },
    });
    expect(createDocumentResponse.statusCode).toBe(201);
    const document = createDocumentResponse.json<Document>();
    expect(document.projectId).toBe(project.id);
    expect(document.tsSource).toBe('// initial source');
    expect(document.headVersionId).toBeNull();

    // 6. Mint a presigned PUT URL ─────────────────────────────
    const putUrlResponse = await app.inject({
      method: 'POST',
      url: `/documents/${document.id}/artifacts:sign`,
      cookies,
      payload: {
        filename: 'spec.bin',
        contentType: 'application/octet-stream',
      },
    });
    expect(putUrlResponse.statusCode).toBe(200);
    const putUrl = putUrlResponse.json<ArtifactPutUrlResponse>();
    expect(putUrl.url).toMatch(/^https?:\/\//u);
    expect(putUrl.key).toMatch(new RegExp(`^docs/${document.id}/`, 'u'));

    // 7. PUT payload directly to MinIO ────────────────────────
    const payload = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x01, 0x02, 0x03]);
    const putHttpResponse = await fetch(putUrl.url, {
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream' },
      body: payload,
    });
    expect(putHttpResponse.ok).toBe(true);

    // 8. Mint a presigned GET URL ─────────────────────────────
    const getUrlResponse = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}/artifacts:sign?key=${encodeURIComponent(putUrl.key)}`,
      cookies,
    });
    expect(getUrlResponse.statusCode).toBe(200);
    const getUrl = getUrlResponse.json<ArtifactGetUrlResponse>();
    expect(getUrl.url).toMatch(/^https?:\/\//u);

    // 9. GET the payload back and assert byte equality ───────
    const getHttpResponse = await fetch(getUrl.url);
    expect(getHttpResponse.ok).toBe(true);
    const roundTripped = new Uint8Array(await getHttpResponse.arrayBuffer());
    expect(roundTripped).toEqual(payload);

    // 10. Delete the project → cascades to the document ──────
    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/projects/${project.id}`,
      cookies,
    });
    expect(deleteResponse.statusCode).toBe(204);

    // 11. The document is gone ───────────────────────────────
    const getDeletedResponse = await app.inject({
      method: 'GET',
      url: `/documents/${document.id}`,
      cookies,
    });
    expect(getDeletedResponse.statusCode).toBe(404);
  });
});

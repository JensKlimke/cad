/**
 * /documents CRUD + artifact integration spec.
 *
 * The happy-path round-trip (create → presigned PUT → GET →
 * byte equality → delete cascade) lives in the lifecycle spec.
 * This file pins the error surfaces and the artifact key
 * isolation contract:
 *
 *   - unauthenticated access   → 401
 *   - unknown document id      → 404 (documents.not_found)
 *   - patch unknown id         → 404
 *   - document under unknown project → 404 (projects.not_found)
 *   - presigning for unknown document → 404
 *   - presigned GET with a key from a DIFFERENT document →
 *     400 documents.invalid_artifact_key
 *
 * Gated on `INTEGRATION=1`.
 */

import {
  ErrorEnvelopeSchema,
  type ArtifactPutUrlResponse,
  type Document,
  type ErrorEnvelope,
  type LoginResponse,
  type Project,
} from '@cad/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME, extractSessionCookie } from '../src/cookies.js';
import { createApiTestContext, type ApiTestContext } from '../src/createApiTestContext.js';

function parseEnvelope(raw: unknown): ErrorEnvelope {
  return ErrorEnvelopeSchema.parse(raw);
}

describe('/documents', () => {
  let context: ApiTestContext;
  let cookies: Record<string, string>;
  let project: Project;

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
      throw new Error(`documents.int.test: login failed (status ${String(login.statusCode)})`);
    }
    login.json<LoginResponse>();
    cookies = { [SESSION_COOKIE_NAME]: extractSessionCookie(login.headers['set-cookie']) };

    const projectResponse = await context.app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: 'documents spec host' },
    });
    if (projectResponse.statusCode !== 201) {
      throw new Error(
        `documents.int.test: project create failed (status ${String(projectResponse.statusCode)})`,
      );
    }
    project = projectResponse.json<Project>();
  });

  afterAll(async () => {
    if (context !== undefined) {
      await context.close();
    }
  });

  it('rejects unauthenticated list as 401', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: `/projects/${project.id}/documents`,
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when creating a document under an unknown project', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/projects/01JZZZZZZZZZZZZZZZZZZZZZZZ/documents',
      cookies,
      payload: { name: 'orphan', tsSource: '// nope' },
    });
    expect(response.statusCode).toBe(404);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('projects.not_found');
  });

  it('returns 404 on GET of an unknown document id', async () => {
    const response = await context.app.inject({
      method: 'GET',
      url: '/documents/01JZZZZZZZZZZZZZZZZZZZZZZZ',
      cookies,
    });
    expect(response.statusCode).toBe(404);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('documents.not_found');
    expect(envelope.error.i18nKey).toBe('errors:documents.not_found');
  });

  it('returns 404 on PATCH of an unknown document id', async () => {
    const response = await context.app.inject({
      method: 'PATCH',
      url: '/documents/01JZZZZZZZZZZZZZZZZZZZZZZZ',
      cookies,
      payload: { name: 'renamed' },
    });
    expect(response.statusCode).toBe(404);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('documents.not_found');
  });

  it('updates a document tsSource and preserves headVersionId=null', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'editable', tsSource: 'export const v = 1;' },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const patched = await context.app.inject({
      method: 'PATCH',
      url: `/documents/${document.id}`,
      cookies,
      payload: { tsSource: 'export const v = 2;' },
    });
    expect(patched.statusCode).toBe(200);
    const updated = patched.json<Document>();
    expect(updated.tsSource).toBe('export const v = 2;');
    expect(updated.name).toBe('editable');
    expect(updated.headVersionId).toBeNull();
  });

  it('rejects presigning against a non-existent document with 404', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/documents/01JZZZZZZZZZZZZZZZZZZZZZZZ/artifacts:sign',
      cookies,
      payload: { filename: 'x.bin', contentType: 'application/octet-stream' },
    });
    expect(response.statusCode).toBe(404);
    expect(parseEnvelope(response.json()).error.code).toBe('documents.not_found');
  });

  it('rejects a presigned GET when the key belongs to a different document', async () => {
    const docA = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'doc-a', tsSource: '' },
    });
    const docB = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'doc-b', tsSource: '' },
    });
    expect(docA.statusCode).toBe(201);
    expect(docB.statusCode).toBe(201);
    const a = docA.json<Document>();
    const b = docB.json<Document>();

    const putForA = await context.app.inject({
      method: 'POST',
      url: `/documents/${a.id}/artifacts:sign`,
      cookies,
      payload: { filename: 'only-a.bin', contentType: 'application/octet-stream' },
    });
    expect(putForA.statusCode).toBe(200);
    const putUrl = putForA.json<ArtifactPutUrlResponse>();

    // Try to mint a presigned GET for document B using A's key.
    const crossDoc = await context.app.inject({
      method: 'GET',
      url: `/documents/${b.id}/artifacts:sign?key=${encodeURIComponent(putUrl.key)}`,
      cookies,
    });
    expect(crossDoc.statusCode).toBe(400);
    const envelope = parseEnvelope(crossDoc.json());
    expect(envelope.error.code).toBe('documents.invalid_artifact_key');
  });
});

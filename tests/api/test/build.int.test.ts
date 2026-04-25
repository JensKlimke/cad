import {
  DocumentBuildFailedEventSchema,
  DocumentBuildRunningEventSchema,
  ErrorEnvelopeSchema,
  type BuildDocumentResponse,
  type DocumentBuildEvent,
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

function waitForPublishedEvents(
  context: ApiTestContext,
  documentId: string,
  expectedCount: number,
): Promise<DocumentBuildEvent[]> {
  return new Promise((resolve) => {
    const events: DocumentBuildEvent[] = [];
    const eventBus = context.app as typeof context.app & {
      readonly documentEvents: {
        subscribe(
          documentId: string,
          listener: (event: DocumentBuildEvent) => void,
        ): () => void;
      };
    };
    const unsubscribe = eventBus.documentEvents.subscribe(documentId, (event) => {
      events.push(event);
      if (events.length >= expectedCount) {
        unsubscribe();
        resolve(events);
      }
    });
  });
}

const VALID_DOCUMENT = `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 14, unit: 'mm' },
    depth: { kind: 'number', value: 22, unit: 'mm' },
    height: { kind: 'expression', expression: 'depth', unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="14" height="22" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
});
`;

describe('/documents/:id/build', () => {
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
      throw new Error(`build.int.test: login failed (status ${String(login.statusCode)})`);
    }
    login.json<LoginResponse>();
    cookies = { [SESSION_COOKIE_NAME]: extractSessionCookie(login.headers['set-cookie']) };

    const projectResponse = await context.app.inject({
      method: 'POST',
      url: '/projects',
      cookies,
      payload: { name: 'build spec host' },
    });
    if (projectResponse.statusCode !== 201) {
      throw new Error(`build.int.test: project create failed (status ${String(projectResponse.statusCode)})`);
    }
    project = projectResponse.json<Project>();
  });

  afterAll(async () => {
    if (context !== undefined) {
      await context.close();
    }
  });

  it('builds a persisted document and stores a downloadable artifact', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'buildable', tsSource: VALID_DOCUMENT },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const response = await context.app.inject({
      method: 'POST',
      url: `/documents/${document.id}/build`,
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const build = response.json<BuildDocumentResponse>();
    expect(build.documentId).toBe(document.id);
    expect(build.artifactKey).toMatch(new RegExp(`^builds/${document.id}/`, 'u'));
    expect(build.build.documentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(build.build.parameterOrder).toEqual(['width', 'depth', 'height']);
    expect(build.build.parameters.height).toBeDefined();
    expect(build.build.parameters.height?.value).toBe(22);
    expect(build.build.features).toEqual([
      expect.objectContaining({ id: 'sketch_1', kind: 'sketch', cached: false }),
      expect.objectContaining({ id: 'pad_1', kind: 'pad', cached: false }),
    ]);
    expect(build.build.tessellation.metadata.hash).toMatch(/^[a-f0-9]{64}$/u);

    const artifactResponse = await fetch(build.artifactUrl);
    expect(artifactResponse.ok).toBe(true);
    const artifactJson = (await artifactResponse.json()) as BuildDocumentResponse['build'];
    expect(artifactJson.documentHash).toBe(build.build.documentHash);
    expect(artifactJson.parameterOrder).toEqual(build.build.parameterOrder);
    expect(artifactJson.tessellation.metadata.hash).toBe(build.build.tessellation.metadata.hash);
  });

  it('exports a built document as STL', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'exportable', tsSource: VALID_DOCUMENT },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const response = await context.app.inject({
      method: 'GET',
      url: `/documents/${document.id}/export/stl`,
      cookies,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('model/stl');
    expect(response.headers['content-disposition']).toContain(`${document.name}.stl`);
    expect(response.rawPayload.byteLength).toBeGreaterThan(84);
  });

  it('returns 404 for an unknown document id', async () => {
    const response = await context.app.inject({
      method: 'POST',
      url: '/documents/01JZZZZZZZZZZZZZZZZZZZZZZZ/build',
      cookies,
    });
    expect(response.statusCode).toBe(404);
    expect(parseEnvelope(response.json()).error.code).toBe('documents.not_found');
  });

  it('returns 422 when the document source cannot be built', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: {
        name: 'broken-build',
        tsSource: `import fs from 'node:fs';

export default {};
`,
      },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const response = await context.app.inject({
      method: 'POST',
      url: `/documents/${document.id}/build`,
      cookies,
    });
    expect(response.statusCode).toBe(422);
    const envelope = parseEnvelope(response.json());
    expect(envelope.error.code).toBe('documents.build_failed');
    expect(envelope.error.message).toContain('Only "@cad/sdk" imports are allowed');
    expect(envelope.error.details).toEqual({
      diagnostics: [
        expect.objectContaining({
          code: 'runtime.unsupported_import',
        }),
      ],
    });
  });

  it('publishes a build event to document subscribers', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: { name: 'streamed-build', tsSource: VALID_DOCUMENT },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const eventPromise = waitForPublishedEvents(context, document.id, 2);

    const response = await context.app.inject({
      method: 'POST',
      url: `/documents/${document.id}/build`,
      cookies,
    });
    expect(response.statusCode).toBe(200);
    const build = response.json<BuildDocumentResponse>();

    const streamed = await eventPromise;
    expect(streamed[0]).toEqual(
      DocumentBuildRunningEventSchema.parse({
        type: 'documents.build.running',
        payload: { documentId: document.id },
      }),
    );
    const readyEvent = streamed[1];
    expect(readyEvent).toEqual(
      expect.objectContaining({
        type: 'documents.build.ready',
        payload: expect.objectContaining({
          documentId: document.id,
          build: expect.objectContaining({
            documentHash: build.build.documentHash,
            tessellation: expect.objectContaining({
              metadata: expect.objectContaining({
                hash: build.build.tessellation.metadata.hash,
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('publishes a failed build event with diagnostics to document subscribers', async () => {
    const created = await context.app.inject({
      method: 'POST',
      url: `/projects/${project.id}/documents`,
      cookies,
      payload: {
        name: 'streamed-build-failure',
        tsSource: `import fs from 'node:fs';

export default {};
`,
      },
    });
    expect(created.statusCode).toBe(201);
    const document = created.json<Document>();

    const eventPromise = waitForPublishedEvents(context, document.id, 2);

    const response = await context.app.inject({
      method: 'POST',
      url: `/documents/${document.id}/build`,
      cookies,
    });
    expect(response.statusCode).toBe(422);

    const streamed = await eventPromise;
    expect(streamed[0]).toEqual(
      DocumentBuildRunningEventSchema.parse({
        type: 'documents.build.running',
        payload: { documentId: document.id },
      }),
    );
    expect(DocumentBuildFailedEventSchema.parse(streamed[1])).toEqual(
      expect.objectContaining({
        type: 'documents.build.failed',
        payload: expect.objectContaining({
          documentId: document.id,
          message: 'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
          diagnostics: [
            expect.objectContaining({
              code: 'runtime.unsupported_import',
              message: 'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
            }),
          ],
        }),
      }),
    );
  });
});

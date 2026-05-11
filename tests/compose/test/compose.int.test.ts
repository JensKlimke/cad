import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'deploy/compose/docker-compose.yml');
const ENV_FILE = path.join(REPO_ROOT, 'deploy/compose/.env.example');
const PROJECT_NAME = process.env['COMPOSE_PROJECT_NAME'] ?? 'cad-compose-test';
const BASE_URL = 'http://127.0.0.1:15173';
const API_BASE_URL = 'http://127.0.0.1:18080';
const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'change-me-admin-password';
const DOCKER_TIMEOUT_MS = 600_000;
const WAIT_TIMEOUT_MS = 240_000;
const COMPOSE_ENV = {
  ...process.env,
  POSTGRES_PORT: '15432',
  MINIO_PORT: '19000',
  MINIO_CONSOLE_PORT: '19001',
  SERVER_PORT: '18080',
  WEB_PORT: '15173',
  PUBLIC_BASE_URL: BASE_URL,
  CORS_ORIGINS: BASE_URL,
};

async function runDockerCompose(args: readonly string[]): Promise<void> {
  await execFileAsync(
    'docker',
    [
      'compose',
      '--project-name',
      PROJECT_NAME,
      '--env-file',
      ENV_FILE,
      '-f',
      COMPOSE_FILE,
      ...args,
    ],
    {
      cwd: REPO_ROOT,
      env: COMPOSE_ENV,
      timeout: DOCKER_TIMEOUT_MS,
    },
  );
}

async function waitFor(url: string, matcher: (response: Response) => boolean): Promise<Response> {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    try {
      const response = await fetch(url);
      if (matcher(response)) {
        return response;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function login(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  const sessionCookie = setCookie?.split(';')[0];
  if (sessionCookie === undefined) {
    throw new Error('login did not return a session cookie');
  }
  return sessionCookie;
}

describe('compose stack', () => {
  afterAll(async () => {
    await runDockerCompose(['down', '--volumes', '--remove-orphans']);
  });

  it('boots the full stack and persists project + document state across restart', async () => {
    await runDockerCompose(['up', '--build', '-d']);

    const health = await waitFor(`${API_BASE_URL}/health`, (response) => response.ok);
    expect(await health.json()).toMatchObject({ ok: true, service: '@cad/server' });

    const ready = await waitFor(`${API_BASE_URL}/ready`, (response) => response.ok);
    expect(await ready.json()).toEqual({ ok: true, checks: { db: true, storage: true } });

    const web = await waitFor(`${BASE_URL}/login`, (response) => response.ok);
    expect(await web.text()).toContain('<!doctype html>');

    const sessionCookie = await login();

    const projectResponse = await fetch(`${API_BASE_URL}/projects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
      },
      body: JSON.stringify({ name: 'compose persistence project' }),
    });
    expect(projectResponse.status).toBe(201);
    const project = (await projectResponse.json()) as { id: string; name: string };

    const documentResponse = await fetch(`${API_BASE_URL}/projects/${project.id}/documents`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        cookie: sessionCookie,
      },
      body: JSON.stringify({ name: 'compose doc', tsSource: '// compose doc' }),
    });
    expect(documentResponse.status).toBe(201);
    const document = (await documentResponse.json()) as { id: string; name: string };

    await runDockerCompose(['down']);
    await runDockerCompose(['up', '-d']);

    await waitFor(`${API_BASE_URL}/ready`, (response) => response.ok);
    const nextSessionCookie = await login();

    const projectsResponse = await fetch(`${API_BASE_URL}/projects?limit=50`, {
      headers: {
        accept: 'application/json',
        cookie: nextSessionCookie,
      },
    });
    expect(projectsResponse.status).toBe(200);
    const projectsBody = (await projectsResponse.json()) as {
      items: Array<{ id: string; name: string }>;
    };
    expect(projectsBody.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: project.id, name: project.name })]),
    );

    const persistedDocumentResponse = await fetch(`${API_BASE_URL}/documents/${document.id}`, {
      headers: {
        accept: 'application/json',
        cookie: nextSessionCookie,
      },
    });
    expect(persistedDocumentResponse.status).toBe(200);
    const persistedDocument = (await persistedDocumentResponse.json()) as {
      id: string;
      name: string;
    };
    expect(persistedDocument).toMatchObject({ id: document.id, name: document.name });

    const viewportResponse = await fetch(
      `${BASE_URL}/projects/${project.id}/documents/${document.id}`,
      {
        headers: {
          cookie: nextSessionCookie,
        },
      },
    );
    expect(viewportResponse.status).toBe(200);
    const viewportHtml = await viewportResponse.text();
    expect(viewportHtml).toContain('<div id="root"></div>');
  });
});

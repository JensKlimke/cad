import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { E2E_BASE_URL, E2E_COMPOSE_ENV, E2E_SERVER_PORT } from './compose-env.js';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'deploy/compose/docker-compose.yml');
const ENV_FILE = path.join(REPO_ROOT, 'deploy/compose/.env.example');
const PROJECT_NAME = process.env['PLAYWRIGHT_COMPOSE_PROJECT'] ?? 'cad-e2e';
const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? E2E_BASE_URL;
const DOCKER_TIMEOUT_MS = 600_000;
const WAIT_TIMEOUT_MS = 240_000;
const COMPOSE_ENV = {
  ...process.env,
  ...E2E_COMPOSE_ENV,
  PUBLIC_BASE_URL: BASE_URL,
  CORS_ORIGINS: BASE_URL,
};

async function runDockerCompose(args: readonly string[], ignoreFailure = false): Promise<void> {
  try {
    await execFileAsync(
      'docker',
      ['compose', '--project-name', PROJECT_NAME, '--env-file', ENV_FILE, '-f', COMPOSE_FILE, ...args],
      {
        cwd: REPO_ROOT,
        env: COMPOSE_ENV,
        timeout: DOCKER_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (ignoreFailure) {
      return;
    }
    throw error;
  }
}

async function waitFor(url: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < WAIT_TIMEOUT_MS) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup(): Promise<void> {
  await runDockerCompose(['down', '--volumes', '--remove-orphans'], true);
  await runDockerCompose(['up', '--build', '-d']);
  await waitFor(`http://127.0.0.1:${E2E_SERVER_PORT}/ready`);
  await waitFor(`${BASE_URL}/login`);
}

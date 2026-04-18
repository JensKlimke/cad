import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { E2E_COMPOSE_ENV } from './compose-env.js';

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'deploy/compose/docker-compose.yml');
const ENV_FILE = path.join(REPO_ROOT, 'deploy/compose/.env.example');
const PROJECT_NAME = process.env['PLAYWRIGHT_COMPOSE_PROJECT'] ?? 'cad-e2e';
const DOCKER_TIMEOUT_MS = 300_000;
const COMPOSE_ENV = {
  ...process.env,
  ...E2E_COMPOSE_ENV,
};

export default async function globalTeardown(): Promise<void> {
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
      'down',
      '--volumes',
      '--remove-orphans',
    ],
    {
      cwd: REPO_ROOT,
      env: COMPOSE_ENV,
      timeout: DOCKER_TIMEOUT_MS,
    },
  );
}

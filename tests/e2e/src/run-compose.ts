import { spawn } from 'node:child_process';
import path from 'node:path';

import { E2E_COMPOSE_ENV } from './compose-env.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'deploy/compose/docker-compose.yml');
const ENV_FILE = path.join(REPO_ROOT, 'deploy/compose/.env.example');
const PROJECT_NAME = process.env['PLAYWRIGHT_COMPOSE_PROJECT'] ?? 'cad-e2e';

interface RunComposeOptions {
  readonly timeoutMs: number;
  readonly ignoreFailure?: boolean;
}

const COMPOSE_ENV = {
  ...process.env,
  ...E2E_COMPOSE_ENV,
  COMPOSE_PARALLEL_LIMIT: process.env['COMPOSE_PARALLEL_LIMIT'] ?? '1',
};

export async function runCompose(
  args: readonly string[],
  options: RunComposeOptions,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
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
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000).unref();
    }, options.timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      if (options.ignoreFailure) {
        resolve();
        return;
      }
      reject(error);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (options.ignoreFailure) {
        resolve();
        return;
      }
      if (timedOut) {
        reject(
          new Error(
            `docker compose ${args.join(' ')} timed out after ${String(options.timeoutMs)} ms.\n${stderr || stdout}`,
          ),
        );
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `docker compose ${args.join(' ')} failed with ${signal === null ? `exit code ${String(code)}` : `signal ${signal}`}.\n${stderr || stdout}`,
        ),
      );
    });
  });
}

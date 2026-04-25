import { E2E_BASE_URL, E2E_SERVER_PORT } from './compose-env.js';
import { runCompose } from './run-compose.js';

const BASE_URL = process.env['PLAYWRIGHT_BASE_URL'] ?? E2E_BASE_URL;
const DOCKER_UP_TIMEOUT_MS = 600_000;
const DOCKER_DOWN_TIMEOUT_MS = 15_000;
const WAIT_TIMEOUT_MS = 240_000;

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
  await runCompose(['down', '--volumes', '--remove-orphans'], {
    timeoutMs: DOCKER_DOWN_TIMEOUT_MS,
    ignoreFailure: true,
  });
  await runCompose(['up', '--build', '-d'], {
    timeoutMs: DOCKER_UP_TIMEOUT_MS,
  });
  await waitFor(`http://127.0.0.1:${E2E_SERVER_PORT}/ready`);
  await waitFor(`${BASE_URL}/login`);
}

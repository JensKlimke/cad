import { runCompose } from './run-compose.js';

const DOCKER_DOWN_TIMEOUT_MS = 15_000;

export default async function globalTeardown(): Promise<void> {
  await runCompose(['down', '--volumes', '--remove-orphans'], {
    timeoutMs: DOCKER_DOWN_TIMEOUT_MS,
    ignoreFailure: true,
  });
}

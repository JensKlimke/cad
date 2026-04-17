import { parentPort } from 'node:worker_threads';

import { executeInSandbox } from './sandbox.js';

import type { WorkerRequest } from './sandbox.js';
import type { WorkerMessage } from './types.js';

if (parentPort === null) {
  throw new Error('runtime worker must run inside worker_threads');
}

parentPort.on('message', async (request: WorkerRequest) => {
  const message = await executeInSandbox(request);
  parentPort?.postMessage(message satisfies WorkerMessage);
});

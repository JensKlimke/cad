import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import { runtimeError, RuntimeBuildError } from './errors.js';

import type { RuntimeBuildResult, RuntimeOptions, WorkerMessage } from './types.js';

const DEFAULT_OPTIONS = {
  timeoutMs: 5000,
  memoryMb: 128,
} satisfies Required<RuntimeOptions>;

function resolveWorkerUrl(): URL {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const candidates = [
    path.join(currentDir, 'worker.js'),
    path.resolve(currentDir, '..', 'dist', 'worker.js'),
    path.join(currentDir, 'worker.ts'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return pathToFileURL(candidate);
    }
  }

  throw new Error(`runtime worker not found near ${currentFile}`);
}

export async function executeDocument(
  source: string,
  options: RuntimeOptions = {},
): Promise<RuntimeBuildResult> {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  return new Promise<RuntimeBuildResult>((resolve, reject) => {
    const worker = new Worker(resolveWorkerUrl(), {
      resourceLimits: {
        maxOldGenerationSizeMb: resolved.memoryMb,
        maxYoungGenerationSizeMb: Math.min(32, Math.max(16, Math.floor(resolved.memoryMb / 4))),
      },
    });

    const timer = setTimeout(() => {
      void worker.terminate();
      reject(
        runtimeError(
          'runtime.timeout',
          `Document build exceeded timeout of ${resolved.timeoutMs} ms.`,
          [
            {
              code: 'runtime.timeout',
              message: `Document build exceeded timeout of ${resolved.timeoutMs} ms.`,
              context: { timeoutMs: resolved.timeoutMs },
            },
          ],
        ),
      );
    }, resolved.timeoutMs);

    worker.once('message', (message: WorkerMessage) => {
      clearTimeout(timer);
      void worker.terminate();
      if (message.ok) {
        resolve(message.result);
        return;
      }
      reject(
        new RuntimeBuildError(message.error.code, message.error.message, message.error.diagnostics),
      );
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      void worker.terminate();
      reject(
        runtimeError(
          'runtime.worker_error',
          error instanceof Error ? error.message : String(error),
          [
            {
              code: 'runtime.worker_error',
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        ),
      );
    });
    worker.postMessage({
      source,
      options: resolved,
    });
  });
}

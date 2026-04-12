/**
 * Kernel Web Worker.
 *
 * Owns the OpenCascade.js WASM instance for the whole web app. Boots once
 * on the first `createBox` request, reuses the kernel for subsequent calls.
 * Never runs on the main thread — this keeps the ~1 s OCCT boot off the
 * UI event loop.
 *
 * Protocol (main thread ↔ worker):
 *
 *   main → worker:  { kind: 'createBox', id: number, input: BoxInput }
 *   worker → main:  { kind: 'result', id: number, result: TessellationResult }
 *                 | { kind: 'error',  id: number, message: string }
 *
 * IDs disambiguate concurrent in-flight requests; the main-thread hook
 * filters by id. `TessellationResult` travels via structured clone (the
 * underlying typed-array buffers are small enough that the zero-copy
 * transferable optimization is not worth the complexity here).
 *
 * The WASM asset URL is imported via Vite's `?url` suffix and passed to
 * `initOCCT`'s `locateFile` hook — the exact browser contract exposed by
 * `@cad/kernel/src/occt.ts`.
 */

// Vite rewrites this import to the bundled asset URL at build time.
import { createBox, initOCCT, type BoxInput, type TessellationResult } from '@cad/kernel';
import wasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url';

export interface CreateBoxRequest {
  readonly kind: 'createBox';
  readonly id: number;
  readonly input: BoxInput;
}

export type WorkerRequest = CreateBoxRequest;

export interface CreateBoxResponse {
  readonly kind: 'result';
  readonly id: number;
  readonly result: TessellationResult;
}

export interface WorkerErrorResponse {
  readonly kind: 'error';
  readonly id: number;
  readonly message: string;
}

export type WorkerResponse = CreateBoxResponse | WorkerErrorResponse;

let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await initOCCT({ locateFile: () => wasmUrl });
  initialized = true;
}

function isCreateBoxRequest(value: unknown): value is CreateBoxRequest {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { kind?: unknown; id?: unknown; input?: unknown };
  return (
    candidate.kind === 'createBox' &&
    typeof candidate.id === 'number' &&
    typeof candidate.input === 'object' &&
    candidate.input !== null
  );
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isCreateBoxRequest(request)) {
    // Malformed messages are a protocol bug: the main thread always sends
    // well-typed requests. Surface them through the worker devtools
    // console — in a Web Worker `console` is the debug channel, not a
    // forbidden side effect, so we suppress the repo-wide `no-console`
    // rule inline with a justification.
    // eslint-disable-next-line no-console -- Worker devtools channel (see comment)
    console.error('@cad/web/kernel.worker: unrecognized request', request);
    return;
  }

  void handleCreateBox(request);
});

async function handleCreateBox(request: CreateBoxRequest): Promise<void> {
  try {
    await ensureInitialized();
    const result = await createBox(request.input);
    const response: CreateBoxResponse = { kind: 'result', id: request.id, result };
    self.postMessage(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const response: WorkerErrorResponse = { kind: 'error', id: request.id, message };
    self.postMessage(response);
  }
}

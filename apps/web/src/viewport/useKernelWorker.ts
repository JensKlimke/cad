/**
 * React hook that owns the kernel Web Worker lifecycle and exposes the
 * current tessellation state to the viewport component.
 *
 * The hook is deliberately thin — it does not know about three.js or
 * WebGL. Its single responsibility is turning a `BoxInput` into a
 * `TessellationResult` (or error) via the worker protocol defined in
 * `kernel.worker.ts`.
 *
 * Designed to be testable: pass a `workerFactory` override to inject a
 * mock Worker implementation under `happy-dom` (see
 * `test/use-kernel-worker.test.tsx`).
 */

import { useEffect, useRef, useState } from 'react';

import type { CreateBoxRequest, WorkerResponse } from './kernel.worker.js';
import type { BoxInput, TessellationResult } from '@cad/kernel';

export interface KernelWorkerState {
  readonly result: TessellationResult | null;
  readonly error: string | null;
  readonly pending: boolean;
}

export interface UseKernelWorkerOptions {
  /**
   * Override the Worker constructor. Exists for tests — production code
   * uses the default, which instantiates `kernel.worker.ts` via Vite's
   * `new URL('./kernel.worker.ts', import.meta.url)` pattern.
   */
  readonly workerFactory?: () => Worker;
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('kernel.worker.ts', import.meta.url), { type: 'module' });
}

const INITIAL_STATE: KernelWorkerState = {
  result: null,
  error: null,
  pending: true,
};

/**
 * Send one `BoxInput` to the kernel worker and track its result.
 *
 * Re-sends whenever `box` changes; cleans up its worker on unmount. Only
 * the most recent request's response updates state — stale responses from
 * an earlier `box` value are discarded via the request-id check.
 */
export function useKernelWorker(
  box: BoxInput,
  options: UseKernelWorkerOptions = {},
): KernelWorkerState {
  const factory = options.workerFactory ?? defaultWorkerFactory;
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<KernelWorkerState>(INITIAL_STATE);

  // Own the worker across the component's lifetime.
  useEffect(() => {
    const worker = factory();
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // The factory is captured at mount; intentional single-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispatch a fresh request whenever `box` changes.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState({ result: null, error: null, pending: true });

    const handleMessage = (event: MessageEvent<WorkerResponse>): void => {
      const response = event.data;
      if (response.id !== requestId) return; // stale
      if (response.kind === 'result') {
        setState({ result: response.result, error: null, pending: false });
      } else {
        setState({ result: null, error: response.message, pending: false });
      }
    };

    worker.addEventListener('message', handleMessage);

    const request: CreateBoxRequest = { kind: 'createBox', id: requestId, input: box };
    worker.postMessage(request);

    return () => {
      worker.removeEventListener('message', handleMessage);
    };
  }, [box]);

  return state;
}

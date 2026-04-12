/**
 * Unit tests for `useKernelWorker`.
 *
 * Uses a mock `Worker` implementation injected via the hook's
 * `workerFactory` option — no happy-dom Worker, no OCCT boot, no network.
 * Verifies the full state machine:
 *
 *   initial   → { pending: true,  result: null,  error: null }
 *   on result → { pending: false, result: X,     error: null }
 *   on error  → { pending: false, result: null,  error: "..." }
 *
 * Stale responses (from a previous `box` value) are discarded.
 */

import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useKernelWorker } from '../src/viewport/useKernelWorker.js';

import type { BoxInput, TessellationResult } from '@cad/kernel';

type MessageListener = (event: MessageEvent<unknown>) => void;

/** Minimal in-memory Worker double. Records what it received and lets the
 *  test push fake messages back to the main thread. */
class FakeWorker {
  readonly posted: unknown[] = [];
  private listeners: MessageListener[] = [];
  terminated = false;

  postMessage(value: unknown): void {
    this.posted.push(value);
  }

  addEventListener(_event: 'message', listener: MessageListener): void {
    this.listeners.push(listener);
  }

  removeEventListener(_event: 'message', listener: MessageListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Test-only: push a synthesized message to every active listener. */
  emit(data: unknown): void {
    const event = { data } as MessageEvent<unknown>;
    for (const listener of this.listeners) listener(event);
  }
}

const BOX: BoxInput = { width: 1, depth: 2, height: 3 };

function makeTessellation(hash: string): TessellationResult {
  return {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    metadata: {
      hash,
      triangleCount: 1,
      vertexCount: 3,
      bbox: { min: [0, 0, 0], max: [1, 1, 0] },
    },
  };
}

let worker: FakeWorker;

beforeEach(() => {
  worker = new FakeWorker();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useKernelWorker', () => {
  it('starts in the pending state and posts a createBox request', () => {
    const { result } = renderHook(() =>
      useKernelWorker(BOX, { workerFactory: () => worker as unknown as Worker }),
    );

    expect(result.current.pending).toBe(true);
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();

    expect(worker.posted).toHaveLength(1);
    const request = worker.posted[0] as { kind: string; id: number; input: BoxInput };
    expect(request.kind).toBe('createBox');
    expect(request.input).toEqual(BOX);
    expect(typeof request.id).toBe('number');
  });

  it('transitions to success when the worker responds with a result', async () => {
    const { result } = renderHook(() =>
      useKernelWorker(BOX, { workerFactory: () => worker as unknown as Worker }),
    );
    const request = worker.posted[0] as { id: number };
    const tessellation = makeTessellation('abc123');

    act(() => {
      worker.emit({ kind: 'result', id: request.id, result: tessellation });
    });

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.result?.metadata.hash).toBe('abc123');
    expect(result.current.error).toBeNull();
  });

  it('transitions to error when the worker responds with an error', async () => {
    const { result } = renderHook(() =>
      useKernelWorker(BOX, { workerFactory: () => worker as unknown as Worker }),
    );
    const request = worker.posted[0] as { id: number };

    act(() => {
      worker.emit({ kind: 'error', id: request.id, message: 'boot failed' });
    });

    await waitFor(() => {
      expect(result.current.pending).toBe(false);
    });
    expect(result.current.error).toBe('boot failed');
    expect(result.current.result).toBeNull();
  });

  it('ignores stale responses tagged with a non-current request id', async () => {
    const { result } = renderHook(() =>
      useKernelWorker(BOX, { workerFactory: () => worker as unknown as Worker }),
    );

    act(() => {
      worker.emit({ kind: 'result', id: 9999, result: makeTessellation('stale') });
    });

    // State should NOT have advanced.
    expect(result.current.pending).toBe(true);
    expect(result.current.result).toBeNull();
  });

  it('terminates the worker on unmount', () => {
    const { unmount } = render(<HookHost box={BOX} worker={worker} />);
    expect(worker.terminated).toBe(false);
    unmount();
    expect(worker.terminated).toBe(true);
  });
});

interface HookHostProps {
  readonly box: BoxInput;
  readonly worker: FakeWorker;
}

function HookHost({ box, worker: fake }: HookHostProps): React.JSX.Element {
  useKernelWorker(box, { workerFactory: () => fake as unknown as Worker });
  return <div />;
}

/**
 * Smoke test for `<App />`.
 *
 * happy-dom cannot render a real WebGL canvas, so we cannot assert the
 * box is actually visible. What this test verifies is that the React
 * tree mounts without throwing — catches missing imports, null-ref bugs,
 * and SSR-unsafe patterns. The `data-tessellation-hash` attribute
 * starts empty and is populated later once the real kernel runs; that
 * full-pixel assertion lives in Playwright (W12).
 *
 * To prevent the component from trying to `new Worker(new URL(...))`
 * (which fails under happy-dom), we stub `globalThis.Worker` with a
 * no-op implementation before rendering.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

class NoopWorker {
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  terminate(): void {}
}

describe('<App />', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', NoopWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts without throwing and exposes the data-tessellation-hash attribute', () => {
    render(<App />);
    const root = screen.getByText(/booting kernel/iu).parentElement;
    expect(root).not.toBeNull();
    expect(root?.hasAttribute('data-tessellation-hash')).toBe(true);
  });
});

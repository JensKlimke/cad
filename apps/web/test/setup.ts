/**
 * Vitest setup file for `@cad/web`. Runs once per test worker before any
 * test file executes.
 *
 * happy-dom's default globals are enough for React 19 to render, but
 * `window.matchMedia`, `ResizeObserver`, and a few other browser APIs are
 * not implemented. Components that rely on them should inject stubs via
 * `vi.stubGlobal` inside the specific test; we intentionally do not
 * polyfill them globally so tests that need them surface the dependency.
 *
 * The only global we do install is a minimal `requestAnimationFrame`
 * scheduler, because React 19 uses it for scheduling and happy-dom's
 * implementation is a no-op.
 */

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    return setTimeout(() => callback(performance.now()), 16) as unknown as number;
  };
  globalThis.cancelAnimationFrame = (handle: number): void => {
    clearTimeout(handle);
  };
}

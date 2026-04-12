/**
 * Tests for `occt.ts`.
 *
 * Covers:
 * - The browser-environment guard in `resolveDefaultLocateFile` (via a
 *   mocked `globalThis.window`). Exercised first — `initOCCT` resets its
 *   memoized state on failure so this attempt does not poison the shared
 *   boot for the rest of the suite.
 * - `getOccVersion` after a real boot — we assert it returns a non-empty
 *   string, whatever value the OCCT build exposes to JS.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getOccVersion, initOCCT } from '../src/occt.js';

describe('initOCCT — browser-environment guard', () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (realWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });

  it('throws a helpful error when called in a browser-like environment without locateFile', async () => {
    (globalThis as { window?: unknown }).window = {};
    await expect(initOCCT()).rejects.toThrow(/browser consumers must pass options\.locateFile/u);
  });
});

describe('getOccVersion (integration)', () => {
  it('returns a non-empty string after a real OCCT boot', async () => {
    await initOCCT();
    const version = await getOccVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * Golden journey — "box renders".
 *
 * The only Slice 0 Playwright test. Proves the full kernel → worker →
 * three.js → canvas chain produces the exact tessellation hash captured
 * by `packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap`.
 *
 * The assertion intentionally targets the `data-tessellation-hash`
 * attribute on the viewport root rather than a visual screenshot:
 *
 * - Bit-exact: the kernel's SHA-256 hash is deterministic by design
 *   (int32 canonicalization + `@noble/hashes`), so it proves the browser
 *   runtime produces the same tessellation as the Node integration suite.
 * - Fast: no image diffing, no cross-platform font/antialiasing noise.
 * - Self-updating: the hash is committed alongside the kernel tests, so a
 *   deliberate kernel change surfaces as a reviewable diff in both places.
 *
 * If this test fails, something in the worker or three.js pipeline is
 * producing different geometry than the Node kernel run — the kernel is
 * the contract, the web pipeline is the downstream layer.
 */

import { expect, test } from '@playwright/test';

// Committed snapshot for the 10×20×30 box — kept in sync with
// `packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap`.
const EXPECTED_HASH_10x20x30 = 'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0';

test.describe('kernel → worker → three.js golden journey', () => {
  test('renders the default box and exposes the expected tessellation hash', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await page.goto('/');

    // The root `<div>` carries `data-tessellation-hash`, initially empty
    // while the kernel worker boots OCCT WASM. Wait for the kernel to
    // finish — the hash is the freshness signal.
    const root = page.locator('[data-tessellation-hash]').first();
    await expect(root).toBeVisible();

    await expect
      .poll(
        // Playwright `Locator` exposes `getAttribute` as the canonical
        // async attribute accessor — `.dataset` would require an
        // `evaluate` round-trip inside a poll callback, which is
        // materially more complex for no benefit. Suppress the unicorn
        // preference for raw DOM dataset access here.
        // eslint-disable-next-line unicorn/prefer-dom-node-dataset -- Playwright Locator API
        async () => root.getAttribute('data-tessellation-hash'),
        {
          timeout: 20_000,
          intervals: [250, 500, 1000],
        },
      )
      .toBe(EXPECTED_HASH_10x20x30);

    // Confirm the canvas element is present and has a non-zero size — if
    // the hash asserted above but three.js never painted, the overlay
    // would hide a genuine regression.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const canvasBox = await canvas.boundingBox();
    if (canvasBox === null) {
      throw new Error('canvas has no bounding box — three.js did not mount');
    }
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);

    // Fail the test on any console / uncaught error. The web app should be
    // silent at runtime — any error is a regression we want to catch.
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

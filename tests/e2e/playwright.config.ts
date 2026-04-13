import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the CAD web editor's golden journey suite.
 *
 * Slice 0 has a strict testing-pyramid shape: UI e2e is intentionally
 * narrow (≤10 tests, ≤3 min CI wall time) because Playwright is slow and
 * flaky compared to unit + integration + API e2e. Every assertion here is
 * a "canary" — if any of these fail, the whole stack is broken.
 *
 * Baseline for Slice 0: Chromium only, headless, one worker, one retry.
 * Cross-browser coverage is a post-Slice-0 concern.
 */
export default defineConfig({
  testDir: './src',
  testMatch: '**/*.spec.ts',

  // Single-test suite; no need for parallelism at Slice 0 scope.
  fullyParallel: false,
  workers: 1,

  // Fail fast in CI, retry once on transient flake.
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,

  // 30 s per test is plenty once the dev server is up — the kernel worker
  // boots OCCT in < 2 s on a warm machine.
  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env['CI']
    ? [
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'reports/junit.xml' }],
        ['github'],
      ]
    : [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Launch the web app's Vite preview server (production build) so the
  // test runs against real bundled output, not the dev server. `pnpm dev`
  // has source-map and HMR overhead that distorts readiness timing; the
  // preview server is the closest approximation of production behaviour
  // Playwright can target locally.
  webServer: {
    command: 'pnpm --filter @cad/web preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});

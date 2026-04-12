import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

// Container helpers are a thin library — most of their "tests" are opt-in
// smoke tests that actually boot Docker containers, gated behind the
// `INTEGRATION=1` env var so CI runs them on demand (not on every PR).
const preset = defineVitestPreset({
  packageType: 'node',
  // The helpers are pure factories; coverage is measured via the opt-in
  // smoke test which isn't run by default. Lower the floors so a default
  // `pnpm test` (which runs nothing) doesn't fail the gate.
  coverage: { lines: 0, branches: 0, functions: 0, statements: 0 },
});

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts', 'test/**/*.int.test.ts'],
    // `smoke.int.test.ts` only runs when INTEGRATION=1 is set — see
    // `describe.runIf` in the file itself.
  },
});

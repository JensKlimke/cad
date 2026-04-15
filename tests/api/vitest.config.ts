import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

// Unit tests run by default. Integration tests under `*.int.test.ts`
// boot Postgres + MinIO via `@cad/tests-containers` and are gated on
// `INTEGRATION=1` so plain `pnpm test` stays fast. The include pattern
// `*.test.ts` greedily matches `*.int.test.ts` too, so we exclude the
// integration suffix explicitly when the env var is unset.
const preset = defineVitestPreset({ packageType: 'node' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts'],
    exclude:
      process.env['INTEGRATION'] === '1'
        ? [...(preset.test?.exclude ?? [])]
        : [...(preset.test?.exclude ?? []), '**/*.int.test.ts'],
    // The suite is entirely integration-tier (gated on
    // `INTEGRATION=1`). Plain `pnpm test` excludes every spec by
    // design, so vitest must not treat an empty run as a failure.
    passWithNoTests: true,
    // 120 s bump for the integration tier — Postgres + MinIO boot
    // takes ~8 s per container on a warm machine.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      ...preset.test?.coverage,
      // Integration tier is exercised end-to-end against real
      // infrastructure; the `src/` helpers are covered transitively
      // by every `*.int.test.ts` file. Unit-only coverage would pin
      // the gate at ~0 % when Docker is unavailable.
      exclude: [...(preset.test?.coverage?.exclude ?? []), 'src/**'],
    },
  },
});

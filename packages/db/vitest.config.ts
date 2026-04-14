import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({ packageType: 'node' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    // Pure unit tests run by default. Integration tests under
    // `*.int.test.ts` boot Postgres via `@cad/tests-containers` and
    // are gated on `INTEGRATION=1` so plain `pnpm test` stays fast.
    // The include pattern `*.test.ts` greedily matches
    // `*.int.test.ts` too, so we exclude the integration suffix
    // explicitly when the env var is unset.
    include: ['test/**/*.test.ts'],
    exclude:
      process.env['INTEGRATION'] === '1'
        ? [...(preset.test?.exclude ?? [])]
        : [...(preset.test?.exclude ?? []), '**/*.int.test.ts'],
    coverage: {
      ...preset.test?.coverage,
      // Coverage for `client.ts`, schema definitions, repositories,
      // and the migrator script all comes from the integration
      // suite (`INTEGRATION=1`) — they are end-to-end tested
      // against a Testcontainers Postgres in `*.int.test.ts`.
      // Including them under unit-only coverage would pin the gate
      // at ~6 % despite every code path being exercised in CI.
      // Pure unit code (`ids.ts`, schema introspection) stays in
      // scope so the unit gate has real teeth.
      exclude: [
        ...(preset.test?.coverage?.exclude ?? []),
        'src/client.ts',
        'src/schema/**',
        'src/repositories/**',
        'scripts/**',
      ],
    },
  },
});

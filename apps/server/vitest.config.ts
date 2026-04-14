import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({ packageType: 'node' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    // Pure unit tests run by default. Integration tests under
    // `*.int.test.ts` boot Postgres + MinIO via
    // `@cad/tests-containers` and are gated on `INTEGRATION=1`.
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
      // Plugins, services, routes, and the bootstrap entrypoint
      // are end-to-end tested by the API e2e suite (`tests/api`,
      // Wave E) under INTEGRATION=1. The unit gate exists for
      // pure helper functions only.
      exclude: [
        ...(preset.test?.coverage?.exclude ?? []),
        'src/index.ts',
        'src/app.ts',
        'src/plugins/**',
        'src/services/storage.ts',
        'src/routes/**',
      ],
    },
  },
});

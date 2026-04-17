import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

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
    passWithNoTests: true,
    testTimeout: 10 * 60 * 1000,
    hookTimeout: 10 * 60 * 1000,
    coverage: {
      ...preset.test?.coverage,
      exclude: [...(preset.test?.coverage?.exclude ?? []), 'test/**'],
    },
  },
});

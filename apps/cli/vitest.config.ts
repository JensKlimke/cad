import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({ packageType: 'node' });

// Unlike library packages where `index.ts` is a re-export barrel, `apps/cli`
// keeps its commander program logic in `src/index.ts`. Override the preset's
// default `**/index.ts` exclude so the program surface is measured.
const presetExcludes = (preset.test?.coverage?.exclude ?? []) as string[];
const coverageExclude = presetExcludes.filter((pattern) => pattern !== '**/index.ts');

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts', 'test/**/*.int.test.ts'],
    coverage: {
      ...preset.test?.coverage,
      exclude: coverageExclude,
    },
  },
});

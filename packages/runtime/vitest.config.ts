import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({
  packageType: 'node',
  coverage: {
    branches: 60,
  },
});

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts'],
    coverage: {
      ...preset.test?.coverage,
      exclude: [
        ...((preset.test?.coverage?.exclude ?? []) as string[]),
        'src/worker.ts',
        'src/stl.ts',
      ],
    },
  },
});

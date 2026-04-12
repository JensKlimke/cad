import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({ packageType: 'lib' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts', 'test/**/*.int.test.ts'],
  },
});

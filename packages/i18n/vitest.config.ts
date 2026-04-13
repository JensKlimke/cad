import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

const preset = defineVitestPreset({ packageType: 'lib' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    environment: 'happy-dom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});

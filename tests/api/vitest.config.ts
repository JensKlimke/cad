import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

// The API harness ships with one endpoint (`/health`) at Slice 0 so the
// tests themselves fully exercise it. Coverage thresholds track the
// `node` preset.
const preset = defineVitestPreset({ packageType: 'node' });

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts', 'test/**/*.int.test.ts'],
  },
});

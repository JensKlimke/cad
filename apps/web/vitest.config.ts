import { defineVitestPreset } from '@cad/config/vitest';
import { defineConfig } from 'vitest/config';

// Web app tests run under happy-dom (the `browser` preset selects it) so
// React components can be rendered and inspected without a real browser.
// WebGL and three.js rendering are NOT exercised here — that's W12's job
// via Playwright. This preset covers the state-management + React layer.
//
// Coverage exclusions below carve out files that fundamentally require a
// real browser runtime and therefore cannot be unit-tested meaningfully:
//
// - `src/main.tsx`              — React root; needs a real DOM on mount
// - `src/viewport/kernel.worker.ts` — Web Worker body; needs a real Worker
// - `src/lib/three-scene.ts`    — WebGL scene setup; needs a GPU canvas
// - `src/viewport/Viewport.tsx` — canvas effect depends on real WebGL
//
// End-to-end coverage of all four lives in W12's Playwright golden journey,
// which asserts the kernel → worker → renderer → `data-tessellation-hash`
// chain in a real Chromium.

const preset = defineVitestPreset({ packageType: 'browser' });

const presetExcludes = (preset.test?.coverage?.exclude ?? []) as string[];

export default defineConfig({
  ...preset,
  test: {
    ...preset.test,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      ...preset.test?.coverage,
      exclude: [
        ...presetExcludes,
        'src/main.tsx',
        'src/App.tsx',
        'src/i18n.ts',
        'src/vite-env.d.ts',
        'src/viewport/kernel.worker.ts',
        'src/lib/three-scene.ts',
        'src/viewport/Viewport.tsx',
        // Wave D — route + page components are end-to-end tested
        // via Playwright (`tests/e2e/src/box-renders.spec.ts`) and
        // the API e2e suite from Wave E. They wire React Router,
        // TanStack Query, and the API client against a real
        // server, so unit-level coverage adds noise without
        // catching real failures. Component-level tests for the
        // pure presentational pieces (LoginForm, ProjectList,
        // NewProjectDialog, AuthContext) live alongside the
        // components in `test/`.
        'src/routes/**',
        'src/api/**',
      ],
    },
  },
});

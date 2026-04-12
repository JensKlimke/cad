/**
 * Shared Vitest preset for the CAD monorepo.
 *
 * Produces a config fragment that packages merge into their own
 * `vitest.config.ts`. Coverage thresholds are chosen by `packageType`
 * and can be overridden per package.
 */

/**
 * @typedef {'lib' | 'node' | 'browser'} PackageType
 */

/**
 * @typedef {Object} CoverageThresholds
 * @property {number} [lines]
 * @property {number} [branches]
 * @property {number} [functions]
 * @property {number} [statements]
 */

/**
 * @typedef {Object} VitestPresetOptions
 * @property {PackageType} [packageType]      Defaults to `'lib'`.
 * @property {CoverageThresholds} [coverage]   Override per-package thresholds.
 * @property {string[]} [include]              Override the test file glob.
 * @property {string[]} [exclude]              Override the exclusion glob.
 */

/** @type {Record<PackageType, Required<CoverageThresholds>>} */
const defaultCoverage = {
  lib: { lines: 90, branches: 85, functions: 90, statements: 90 },
  node: { lines: 80, branches: 75, functions: 80, statements: 80 },
  browser: { lines: 70, branches: 60, functions: 70, statements: 70 },
};

/**
 * Produce a Vitest config tailored to the package type.
 *
 * Usage:
 * ```ts
 * import { defineConfig } from 'vitest/config';
 * import { defineVitestPreset } from '@cad/config/vitest';
 * export default defineConfig(defineVitestPreset({ packageType: 'lib' }));
 * ```
 *
 * @param {VitestPresetOptions} [options]
 */
export function defineVitestPreset(options = {}) {
  const packageType = options.packageType ?? 'lib';
  const coverage = { ...defaultCoverage[packageType], ...options.coverage };
  const environment = packageType === 'browser' ? 'happy-dom' : 'node';

  return {
    test: {
      environment,
      globals: false,
      clearMocks: true,
      restoreMocks: true,
      include: options.include ?? [
        'src/**/*.test.{ts,tsx,js,jsx}',
        'test/**/*.test.{ts,tsx,js,jsx}',
      ],
      exclude: options.exclude ?? ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        thresholds: {
          lines: coverage.lines,
          branches: coverage.branches,
          functions: coverage.functions,
          statements: coverage.statements,
        },
        include: ['src/**/*.{ts,tsx,js,jsx,mjs}'],
        exclude: [
          '**/*.d.ts',
          '**/*.test.*',
          '**/__fixtures__/**',
          '**/__mocks__/**',
          '**/index.ts',
        ],
      },
    },
  };
}

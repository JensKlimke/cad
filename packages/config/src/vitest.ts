/**
 * Shared Vitest preset for the CAD monorepo.
 *
 * Produces a config fragment that packages merge into their own
 * `vitest.config.ts`. Coverage thresholds are chosen by `packageType`
 * and can be overridden per package.
 */

import type { ViteUserConfig } from 'vitest/config';

export type PackageType = 'lib' | 'node' | 'browser';

export interface CoverageThresholds {
  readonly lines?: number;
  readonly branches?: number;
  readonly functions?: number;
  readonly statements?: number;
}

export interface VitestPresetOptions {
  /** Defaults to `'lib'`. */
  readonly packageType?: PackageType;
  /** Override per-package thresholds. */
  readonly coverage?: CoverageThresholds;
  /** Override the test file glob. */
  readonly include?: readonly string[];
  /** Override the exclusion glob. */
  readonly exclude?: readonly string[];
}

const defaultCoverage: Record<PackageType, Required<CoverageThresholds>> = {
  lib: { lines: 90, branches: 85, functions: 90, statements: 90 },
  node: { lines: 80, branches: 75, functions: 80, statements: 80 },
  browser: { lines: 70, branches: 60, functions: 70, statements: 70 },
};

/**
 * Produce a Vitest config tailored to the package type.
 *
 * @example
 * ```ts
 * import { defineConfig } from 'vitest/config';
 * import { defineVitestPreset } from '@cad/config/vitest';
 * export default defineConfig(defineVitestPreset({ packageType: 'lib' }));
 * ```
 */
export function defineVitestPreset(options: VitestPresetOptions = {}): ViteUserConfig {
  const packageType = options.packageType ?? 'lib';
  const coverage = { ...defaultCoverage[packageType], ...options.coverage };
  const environment = packageType === 'browser' ? 'happy-dom' : 'node';

  return {
    test: {
      environment,
      globals: false,
      clearMocks: true,
      restoreMocks: true,
      include: options.include
        ? [...options.include]
        : ['src/**/*.test.{ts,tsx,js,jsx}', 'test/**/*.test.{ts,tsx,js,jsx}'],
      exclude: options.exclude
        ? [...options.exclude]
        : ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
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

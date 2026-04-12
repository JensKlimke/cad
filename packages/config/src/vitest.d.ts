/**
 * Type declarations for `@cad/config/vitest`.
 *
 * Hand-written alongside the JS source so TypeScript consumers (e.g. each
 * package's `vitest.config.ts`) get full intellisense and type-checking.
 */

import type { UserConfig } from 'vitest/config';

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
export function defineVitestPreset(options?: VitestPresetOptions): UserConfig;

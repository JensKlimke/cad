/**
 * Type declarations for `@cad/config/eslint`.
 *
 * Named blocks compose into a flat ESLint 9 config. Consumers explicitly
 * arrange them and layer per-area overrides.
 */

import type { Linter } from 'eslint';

/** Global ignore patterns. Must be the first entry in the config array. */
export const ignores: Linter.Config;

/** Language options grouped by runtime. Consumers pick one. */
export const languageOptions: {
  readonly node: Linter.LanguageOptions;
  readonly browser: Linter.LanguageOptions;
};

/** Base JS + import ordering rules applied to every source file. */
export const baseConfig: readonly Linter.Config[];

/** TypeScript rules (non-type-checked — type-checked rules are opt-in per package). */
export const typescriptConfig: readonly Linter.Config[];

/** Unicorn recommended rules with pragmatic overrides. */
export const unicornConfig: Linter.Config;

/** React + hooks + a11y rules. Scoped by the consumer via a `files` pattern. */
export const reactConfig: readonly Linter.Config[];

/** Vitest rules, scoped to test files. */
export const vitestConfig: Linter.Config;

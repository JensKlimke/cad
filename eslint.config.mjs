/**
 * Root ESLint flat config for the CAD monorepo.
 *
 * Composes shared blocks from `@cad/config/eslint` and layers per-area overrides
 * (React + browser globals for apps/web, console allowance for apps/cli and
 * scripts/). Every package uses this one root config — per-package eslint
 * configs are deliberately avoided to keep the rule surface consistent.
 */

import {
  ignores,
  languageOptions,
  baseConfig,
  typescriptConfig,
  unicornConfig,
  reactConfig,
  vitestConfig,
} from '@cad/config/eslint';

/** @type {import('eslint').Linter.Config[]} */
const webReactOverrides = reactConfig.map((block) => ({
  ...block,
  files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
}));

/** @type {import('eslint').Linter.Config[]} */
export default [
  ignores,

  // Default: Node ESM (applies to every package except web overrides below).
  { languageOptions: languageOptions.node },

  ...baseConfig,
  ...typescriptConfig,
  unicornConfig,
  vitestConfig,

  // apps/web uses browser globals + the React rule stack.
  {
    files: ['apps/web/**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: languageOptions.browser,
  },
  ...webReactOverrides,

  // CLI and top-level scripts may log to stdout.
  {
    files: ['apps/cli/**/*.{ts,tsx,js,jsx,mjs}', 'scripts/**/*.{ts,tsx,js,jsx,mjs}'],
    rules: { 'no-console': 'off' },
  },
];

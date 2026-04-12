/**
 * Shared ESLint 10 flat-config blocks for the CAD monorepo.
 *
 * Consumers (root `eslint.config.mjs` and per-package configs) import the
 * named blocks and compose them with file-scoped overrides. The building-
 * block approach keeps each consumer explicit about what rules apply where
 * — the alternative (one monolithic exported config) forces every package
 * to opt out of rules that don't fit.
 */

import js from '@eslint/js';
import vitestPlugin from '@vitest/eslint-plugin';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import type { Linter } from 'eslint';

/**
 * Ignore patterns applied globally. A single `ignores`-only block must be the
 * first item in the flat config array per ESLint 10 semantics.
 */
export const ignores: Linter.Config = {
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.vite/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/.stryker-tmp/**',
    '**/.eslintcache',
    '**/pnpm-lock.yaml',
  ],
};

/**
 * Language options grouped by runtime environment. Consumers pick one.
 */
export const languageOptions: {
  readonly node: Linter.LanguageOptions;
  readonly browser: Linter.LanguageOptions;
} = {
  node: {
    globals: { ...globals.node },
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  browser: {
    globals: { ...globals.browser },
    ecmaVersion: 2023,
    sourceType: 'module',
  },
};

/**
 * Base JavaScript + import ordering rules applied to all source files.
 */
export const baseConfig: Linter.Config[] = [
  js.configs.recommended,
  {
    plugins: {
      'no-only-tests': noOnlyTests,
      'import-x': importX,
    },
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      'no-only-tests/no-only-tests': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'multi-line'],
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];

/**
 * TypeScript rules. Deliberately uses the non-type-checked recommended set —
 * type-checked rules are opt-in per package because they require a
 * `parserOptions.projectService` or a project reference.
 */
export const typescriptConfig: Linter.Config[] = [
  ...(tseslint.configs.recommended as Linter.Config[]),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
];

/**
 * Unicorn recommended rules with a handful of pragmatic overrides. Uses
 * `configs.recommended` (the current flat-config entry point) rather than
 * the deprecated `configs['flat/recommended']` alias.
 */
export const unicornConfig: Linter.Config = {
  plugins: { unicorn },
  rules: {
    ...unicorn.configs.recommended.rules,
    'unicorn/prevent-abbreviations': 'off',
    'unicorn/no-null': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/filename-case': [
      'error',
      { cases: { kebabCase: true, camelCase: true, pascalCase: true } },
    ],
    // Prettier 3 normalizes hex literals to lowercase. Align the rule so
    // `0xff_ff_ff` is accepted and `unicorn/number-literal-case` doesn't
    // fight Prettier's output.
    'unicorn/number-literal-case': ['error', { hexadecimalValue: 'lowercase' }],
  },
};

/**
 * React + hooks + a11y rules. Scoped by the consumer via a `files` pattern —
 * this block deliberately does not set `files` itself so the caller controls
 * where React applies.
 *
 * `eslint-plugin-react`'s flat configs are typed as `T | undefined` even
 * though they exist at runtime, so the first two entries need casts.
 * `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` plug in cleanly
 * without casts under ESLint 9.
 */
export const reactConfig: Linter.Config[] = [
  reactPlugin.configs.flat.recommended as Linter.Config,
  reactPlugin.configs.flat['jsx-runtime'] as Linter.Config,
  reactHooks.configs.flat.recommended,
  {
    plugins: { 'jsx-a11y': jsxA11y },
    rules: { ...jsxA11y.flatConfigs.recommended.rules },
    settings: { react: { version: 'detect' } },
  },
];

/**
 * Vitest rules, scoped to test files.
 */
export const vitestConfig: Linter.Config = {
  files: [
    '**/*.test.{ts,tsx,js,jsx}',
    '**/__tests__/**/*.{ts,tsx,js,jsx}',
    'test/**/*.{ts,tsx,js,jsx}',
  ],
  plugins: { vitest: vitestPlugin },
  rules: {
    ...vitestPlugin.configs.recommended.rules,
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
};

# @cad/config

Shared build, lint, format, and test presets for the CAD monorepo.

This package is intentionally **buildless**. Source files are ES modules with
JSDoc types so consumers (ESLint, Prettier, Vitest, `tsc`) can import them
directly without a compile step. Type checking is done via `tsc --checkJs`.

## What it exports

| Subpath                        | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `@cad/config/eslint`           | Flat-config building blocks for ESLint 10                          |
| `@cad/config/prettier`         | Prettier 3 config object                                           |
| `@cad/config/vitest`           | `defineVitestPreset({ packageType })` with coverage thresholds     |
| `@cad/config/tsconfig/base`    | TS strict base that extends the monorepo root `tsconfig.base.json` |
| `@cad/config/tsconfig/lib`     | Library build (composite, `dist/`, `.tsbuildinfo`)                 |
| `@cad/config/tsconfig/node`    | Node runtime (`types: ['node']`)                                   |
| `@cad/config/tsconfig/browser` | Browser runtime (`lib: DOM`)                                       |

## ESLint usage (flat config)

```js
// eslint.config.mjs
import {
  ignores,
  languageOptions,
  baseConfig,
  typescriptConfig,
  unicornConfig,
  reactConfig,
  vitestConfig,
} from '@cad/config/eslint';

export default [
  ignores,
  { languageOptions: languageOptions.node },
  ...baseConfig,
  ...typescriptConfig,
  unicornConfig,
  vitestConfig,
];
```

## Prettier usage

```js
// .prettierrc.js
import config from '@cad/config/prettier';
export default config;
```

## Vitest usage

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { defineVitestPreset } from '@cad/config/vitest';

export default defineConfig(defineVitestPreset({ packageType: 'lib' }));
```

## TSConfig usage

```json
{
  "extends": "@cad/config/tsconfig/lib",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

## Coverage thresholds

`defineVitestPreset` selects thresholds by `packageType`:

| Type      | Lines | Branches | Functions | Statements |
| --------- | ----- | -------- | --------- | ---------- |
| `lib`     | 90    | 85       | 90        | 90         |
| `node`    | 80    | 75       | 80        | 80         |
| `browser` | 70    | 60       | 70        | 70         |

Override per-package via the `coverage` option.

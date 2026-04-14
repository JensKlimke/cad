/**
 * Root config for `i18next-cli` — the modern replacement for the
 * deprecated `i18next-parser`. Drives `pnpm i18n:extract` (writes
 * catalogs) and `pnpm i18n:check` (CI gate, exits non-zero if
 * source has keys not yet in the catalog).
 *
 * See [Slice 0b](docs/slices/slice-0b-i18n-baseline.md) for the
 * full contract.
 */

import { defineConfig } from 'i18next-cli';

export default defineConfig({
  locales: ['en', 'de'],
  extract: {
    input: [
      'apps/web/src/**/*.{ts,tsx}',
      // Slice 1 will add `apps/server/src/**/*.ts` here once the
      // Fastify server lands. i18next-cli tolerates missing globs
      // (unlike legacy i18next-parser), so we could pre-declare it
      // — but it's still cleaner to add it when the directory
      // actually exists.
    ],
    output: 'packages/i18n/locales/{{language}}/{{namespace}}.json',
    defaultNS: 'common',
    keySeparator: false,
    nsSeparator: ':',
    functions: ['t', '*.t'],
    transComponents: ['Trans'],
    // `useT('ns')` from `@cad/i18n` is a thin wrapper over
    // react-i18next's `useTranslation`. Registering it here teaches
    // the scope-aware analyzer that `const { t } = useT('viewport')`
    // binds the namespace, so subsequent `t('kernel.booting')`
    // calls flow into the `viewport` catalog (not `common`).
    useTranslationNames: ['useTranslation', 'useT'],
    // Slice 0b ships the runtime + complete catalogs for three
    // namespaces. The `common:actions.*` and `errors:*` keys are
    // reserved for Slice 1's UI dialogs and error envelope contract
    // — they exist in the catalog before any source file calls
    // them. `preservePatterns` keeps them through extract passes
    // so the gate doesn't wipe them on every PR. As Slice 1+ adds
    // the actual `t(...)` calls, the patterns become redundant
    // (the keys will be reachable from source) and can be pruned.
    preservePatterns: ['common:actions.*', 'common:state.*', 'errors:*'],
  },
});

/**
 * Root config for `i18next-parser`.
 *
 * Scans every source file in the apps that ship user-visible
 * strings, extracts calls to `t('namespace:key')` / `<Trans>`, and
 * writes the results to `packages/i18n/locales/<lang>/<ns>.json`.
 *
 * `pnpm i18n:extract` runs the writer mode (updates catalogs).
 * `pnpm i18n:check`   runs the dry-run + fail-on-update gate the CI
 *                     job (W13) enforces — any `t(...)` call pointing
 *                     at a key that is not already in the `en`
 *                     catalog fails the build.
 *
 * See [Slice 0b](docs/slices/slice-0b-i18n-baseline.md) for the full
 * contract.
 */

/** @type {import('i18next-parser').UserConfig} */
export default {
  locales: ['en', 'de'],
  output: 'packages/i18n/locales/$LOCALE/$NAMESPACE.json',
  input: [
    'apps/web/src/**/*.{ts,tsx}',
    // Slice 1 will add `apps/server/src/**/*.ts` here once the
    // Fastify server lands — i18next-parser throws ENOENT on
    // missing glob roots, so we cannot pre-declare the path.
  ],
  defaultNamespace: 'common',
  namespaceSeparator: ':',
  // Flat keys ("kernel.booting" stays a single entry, does not
  // nest into `{ kernel: { booting: ... } }`). Matches the shape of
  // the catalogs already committed in `packages/i18n/locales/`.
  keySeparator: false,
  sort: true,
  createOldCatalogs: false,
  // Preserve complete German translations that do not appear in the
  // source — otherwise every extractor pass would wipe translations
  // for keys only reached via runtime composition.
  keepRemoved: true,
  failOnUpdate: false,
  failOnWarnings: true,
  verbose: false,
  lexers: {
    ts: [
      {
        lexer: 'JavascriptLexer',
        // `useT('ns')` from `@cad/i18n` binds the namespace for
        // every subsequent `t(...)` call — teach the extractor so
        // flat keys like `kernel.booting` flow into the correct
        // namespace catalog instead of defaulting to `common`.
        namespaceFunctions: ['useTranslation', 'withTranslation', 'useT'],
      },
    ],
    tsx: [
      {
        lexer: 'JsxLexer',
        namespaceFunctions: ['useTranslation', 'withTranslation', 'useT'],
      },
    ],
    default: ['JavascriptLexer'],
  },
};

# @cad/i18n

Shared internationalization runtime for the CAD monorepo. Wraps
[`i18next`](https://www.i18next.com/) + [`react-i18next`](https://react.i18next.com/)
behind a typed surface so every user-visible string in `apps/web` (and,
from Slice 1 onward, every error envelope in `apps/server`) routes
through a single catalog contract.

Part of [Slice 0b](../../docs/slices/slice-0b-i18n-baseline.md) of the
[delivery plan](../../PLAN.md).

## Launch locales

- `en` — source language (every dev writes keys in English)
- `de` — first translation, complete for every namespace

Adding a third language is a one-line change in `src/locales.ts` plus
one new catalog directory under `locales/<code>/`.

## Namespaces

- `common` — shared reusable strings (actions, loading states)
- `errors` — error envelope `i18nKey` values re-translated by the
  web client
- `viewport` — Slice 0 kernel viewport overlay strings

## Type-safe translation keys

Resources are statically imported in `src/resources.ts` and
declared to the `i18next` module in `src/i18next.d.ts` via
`CustomTypeOptions`. Consumers get compile-time checking for
`t('namespace:key')` calls — misspellings and missing keys fail
`tsc --noEmit`, not at runtime.

## Adding a namespace

1. Create `locales/en/<ns>.json` with the new keys (English is the
   source — every key must exist here first).
2. Create `locales/de/<ns>.json` with the German translation.
3. Add the static import + entry in `src/resources.ts`.
4. Run `pnpm --filter @cad/i18n test` — the parity test will fail
   until the `de` catalog covers every `en` key.

## Adding a language

1. Append the ISO code to `SUPPORTED_LOCALES` in `src/locales.ts`.
2. Create `locales/<code>/` with one JSON file per namespace.
3. No type changes needed — `Locale` narrows automatically from
   the `as const` array.

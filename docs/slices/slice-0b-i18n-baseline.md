# Slice 0b — Internationalization Baseline

> Detailed implementation plan for the i18n infrastructure that every
> later slice depends on.
> Parent roadmap: [`PLAN.md`](../../PLAN.md) — Slice 0b.
> Previous slice: [`slice-0-foundations.md`](./slice-0-foundations.md).
> Next slice: [`slice-1-project-lifecycle.md`](./slice-1-project-lifecycle.md).

## Goal

Land a **production-grade multi-language runtime** (`packages/i18n`) and
wire `apps/web` through it **before** Slice 1 writes its first
user-visible string. From Slice 0b onward, every new slice that ships UI
text routes it through the typed `useT(namespace)` hook, every server
error envelope carries an optional `i18nKey`, and the `i18n:check` CI
gate blocks any PR that introduces a string without a catalog entry.

The slice is deliberately narrow — three namespaces, two locales, one
migrated viewport — but every architectural decision that matters for
the next 15 slices of UI work is locked in here:

1. **Library stack**: `react-i18next` + `i18next` (universal core runs
   in browser, Fastify, Workers, Node).
2. **Catalog format**: JSON namespace files — the interchange format
   every translation service accepts natively.
3. **Locale resolution**: cookie-first (`cad_locale`), mirrored into
   `localStorage`, overrideable by user preference once Slice 1 adds
   auth. **No locale in the URL** — URLs stay stable across languages.
4. **Type safety**: compile-time `t('namespace:key')` checking via
   `declare module 'i18next'` resource augmentation — no codegen
   package, no runtime penalty.
5. **CI gate**: `i18next-parser` runs in check mode on every PR;
   missing source keys block the merge.

The two hard-coded strings in Slice 0's `Viewport.tsx`
(`"Booting kernel…"` and `"Kernel error:"`) are the first migration
target: they prove the translated build renders correctly end-to-end
before any other UI exists to confuse the signal. The committed
tessellation hash is unchanged in both locales (the kernel is
unit-free, language-free geometry), so the Playwright assertion
stays deterministic.

## Definition of Done

A fresh clone of the repo on a clean machine with Node 22 and pnpm
installed can execute:

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm lint:code
pnpm i18n:check          # NEW — i18next-parser in check mode
pnpm format:check
pnpm -r build
pnpm --filter @cad/web preview
# open http://localhost:4173 — English by default
# open devtools, set document.cookie = 'cad_locale=de; Path=/'
# reload — overlay says "Kernel wird geladen…"
pnpm test:e2e            # Playwright runs en + de; both green
```

…and every command exits zero.

Concretely, Slice 0b is done when **all** of the following hold:

1. `packages/i18n` workspace package exists, exports a typed
   `i18next` instance factory (browser + server), a `<I18nProvider>`
   React component, and a `useT(namespace)` hook.
2. Launch catalogs (`en`, `de`) ship complete translations for the
   three Slice 0b namespaces: `common`, `errors`, `viewport`.
3. `apps/web` wraps its root in `<I18nProvider>`; `Viewport.tsx`'s
   two overlay strings are migrated to `t('viewport:...')`.
4. Locale detection chain works end-to-end in a real browser: cookie
   → localStorage → `navigator.language` → `en` fallback.
5. Setting `document.cookie = 'cad_locale=de; Path=/'` and reloading
   switches the viewport overlays to German without a server round-
   trip.
6. `packages/i18n` exports a `createServerI18n()` factory Slice 1's
   Fastify bootstrap consumes (covered by a unit test in this slice
   so the shape is locked before Slice 1 depends on it).
7. `@cad/protocol` **does not yet exist** (it lands in Slice 1 / W2),
   so the `ErrorEnvelopeSchema` extension ships as a type-level
   sketch in Slice 0b's doc; Slice 1 implements it.
8. `i18next-parser.config.js` at repo root scans `apps/web/src/**/*.{ts,tsx}`
   (and, once `apps/server` exists, `apps/server/src/**/*.ts`); the
   `pnpm i18n:check` root script runs it in check mode.
9. New `i18n-check` job in `.github/workflows/ci.yml` runs the gate
   on every PR.
10. The Slice 0 `box-renders` Playwright spec is **replaced** by a
    parameterized version that runs once per locale (`en`, `de`) and
    asserts both the committed tessellation hash **and** the
    localized overlay label matches the catalog entry. Playwright
    test count stays at ≤10 (+1 locale parameter = 2 effective runs
    of a single spec file, counted as 1 "test" in the budget).
11. `pnpm i18n:check` is green; every source string used via `t(...)`
    has a matching `en` catalog entry; `de` is complete for all
    Slice 0b namespaces.
12. `docs/verification/slice-0b.md` manual checklist runs green on a
    clean macOS install.

## Out of Scope (deferred to later slices)

- **Handbook content i18n** — [Slice 4b](./slice-4b-handbook-infrastructure.md)
  reuses the same `@cad/i18n` runtime for its MDX content pipeline.
- **`apps/cli` localization** — developer tool, English-only, does
  not depend on `@cad/i18n`. Documented here so no one retrofits
  later.
- **Kernel error localization** — `@cad/kernel`'s Zod validation
  errors are developer messages, not user-facing. They surface in
  the future server error envelope as an `i18nKey` the web client
  translates.
- **Lazy namespace loading** via `i18next-http-backend` — the three
  Slice 0b namespaces total <5 KB per locale, bundled statically.
  Lazy loading lands in Slice 4+ when the catalog crosses ~50 KB.
- **Language switcher in the top bar** — the component ships in
  Slice 0b behind a feature flag, but only becomes visible in
  [Slice 11](./slice-11-command-palette-polish.md) when the top
  bar itself lands.
- **Additional languages beyond `en` + `de`** — the infra supports
  a one-line addition in `locales.ts` + one catalog directory.
  Adding French, Spanish, or Japanese is a Slice 0b+N follow-up,
  not Slice 0b scope.
- **Server-side HTML response translation** — `request.t` is wired
  in Slice 1 for the error envelope `i18nKey` lookup; real HTML
  email / OIDC consent pages land in [Slice 12](./slice-12-server-api-surface.md).
- **Type-safe key generation from catalog content** —
  `i18next` v23's native typed resources via module augmentation is
  enough. We intentionally skip tools like `typesafe-i18n` or
  `lingui` that regenerate types on every catalog change — the
  manual `interface Resources` declaration is stable and static.
- **MCP tool locale negotiation** — [Slice 14](./slice-14-mcp-server.md)
  threads a `locale` parameter through every MCP tool. Slice 0b
  establishes the package that will be consumed there.

## Repository Layout After Slice 0b

Only **new** and **EXTENDED** files are shown; everything else from
Slice 0 stays put.

```
cad/
  .github/
    workflows/
      ci.yml                                 # EXTENDED: i18n-check job

  i18next-parser.config.js                   # NEW — root extractor config

  packages/
    i18n/                                    # NEW — shared i18n runtime
      src/
        index.ts                             # barrel: createBrowserI18n, createServerI18n, useT, I18nProvider, Trans, Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE
        locales.ts                           # `Locale = 'en' | 'de'`, SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale()
        resources.ts                         # static imports of every JSON catalog; the `Resources` module augmentation target
        instance.ts                          # createBrowserI18n(), createServerI18n() factories
        detector.ts                          # custom cookie-first LanguageDetector
        react.tsx                            # <I18nProvider>, useT(namespace), typed <Trans> re-export
        i18next.d.ts                         # `declare module 'i18next'` augmentation for Resources + DefaultNamespace
      locales/
        en/
          common.json                        # generic reusable strings (ok, cancel, loading, save, delete, error)
          errors.json                        # error envelope i18nKey values (auth.invalid_credentials, projects.not_found, ...)
          viewport.json                      # Slice 0 viewport overlay strings
        de/
          common.json                        # complete translation
          errors.json                        # complete translation
          viewport.json                      # complete translation
      test/
        locales.test.ts                      # SUPPORTED_LOCALES, isSupportedLocale edge cases
        detector.test.ts                     # cookie → localStorage → navigator fallback chain
        instance.test.ts                     # browser + server factories; key resolution; fallback to en
        react.test.tsx                       # <I18nProvider> + useT() in happy-dom
      README.md                              # operator-level doc: usage, adding a language, adding a namespace
      package.json                           # @cad/i18n
      tsconfig.json
      tsconfig.build.json
      vitest.config.ts

  apps/
    web/                                     # EXTENDED — i18n wiring + Slice 0 migration
      src/
        main.tsx                             # EXTENDED: wrap root in <I18nProvider>
        i18n.ts                              # NEW — constructs the browser i18next instance at app boot
        viewport/
          Viewport.tsx                       # EXTENDED: useT('viewport') for overlay strings
        components/
          LanguageSwitcher.tsx               # NEW — the switcher component; hidden until Slice 11
      test/
        Viewport.test.tsx                    # EXTENDED — asserts translated strings in both locales via mocked i18n
        LanguageSwitcher.test.tsx            # NEW — switcher updates cookie + localStorage + i18n active locale
      package.json                           # EXTENDED — adds @cad/i18n, i18next, react-i18next, i18next-browser-languagedetector, i18next-icu

  tests/
    e2e/
      src/
        box-renders.spec.ts                  # EXTENDED — parameterized on locale; asserts both hash AND localized label

  docs/
    slices/
      slice-0b-i18n-baseline.md              # THIS FILE
    verification/
      slice-0b.md                            # NEW — manual checklist
```

## Work Items (ordered, each independently verifiable)

### W1. `packages/i18n` scaffold

**Dependencies**: none beyond workspace tooling.

**Files**

- `packages/i18n/package.json` — `@cad/i18n`, `private: true`,
  `type: module`, `sideEffects: ["**/*.json"]` (catalogs are
  side-effectful imports at Slice 0b scope), `exports` map with
  subpath exports for `.`, `./browser`, `./server`, `./react`,
  `./locales`, `./package.json`. Pinned deps: `i18next@^23`,
  `react-i18next@^15`, `i18next-browser-languagedetector@^8`,
  `i18next-icu@^2`. Peer: `react@^19`, `react-dom@^19`.
- `packages/i18n/tsconfig.json` — extends
  `../../packages/config/tsconfig.node.json`; includes
  `src/**/*`, `test/**/*`.
- `packages/i18n/tsconfig.build.json` — extends
  `../../packages/config/tsconfig.lib.json`; emits `dist/` with
  declaration files.
- `packages/i18n/vitest.config.ts` — extends the `lib` preset from
  `@cad/config/vitest`, env happy-dom (React component tests need
  a DOM).
- `packages/i18n/README.md` — how to use from `apps/web`
  (`<I18nProvider>` + `useT`), how to use from `apps/server` (Slice 1
  will hook this in), how to add a language, how to add a namespace.

**Acceptance**: `pnpm --filter @cad/i18n typecheck` is clean; `pnpm
install` links the package into `node_modules/@cad/i18n`.

### W2. Locale registry (`locales.ts`)

**Files**

- `packages/i18n/src/locales.ts`:

  ```ts
  export const SUPPORTED_LOCALES = ['en', 'de'] as const;
  export type Locale = (typeof SUPPORTED_LOCALES)[number];

  export const DEFAULT_LOCALE: Locale = 'en';

  export function isSupportedLocale(value: unknown): value is Locale {
    return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
  }
  ```

- `packages/i18n/test/locales.test.ts` — asserts each member of
  `SUPPORTED_LOCALES` passes `isSupportedLocale`, rejects
  unsupported candidates (`'xx'`, `''`, `null`, `undefined`, non-
  strings, mixed case), and that `DEFAULT_LOCALE` is included in
  `SUPPORTED_LOCALES`.

**Acceptance**: All tests pass. Adding a third language is a single
`SUPPORTED_LOCALES` change plus one catalog directory — no type
narrowing update needed because the array-of-literals pattern
auto-narrows.

### W3. JSON catalogs — `en` + `de` for three namespaces

**Files**

- `packages/i18n/locales/en/common.json`:
  ```json
  {
    "actions.ok": "OK",
    "actions.cancel": "Cancel",
    "actions.save": "Save",
    "actions.delete": "Delete",
    "actions.retry": "Retry",
    "state.loading": "Loading…"
  }
  ```
- `packages/i18n/locales/de/common.json` — complete German
  translations of every key above (e.g., `"actions.ok": "OK"`,
  `"actions.cancel": "Abbrechen"`, `"state.loading": "Wird geladen…"`).
- `packages/i18n/locales/en/errors.json`:
  ```json
  {
    "generic": "Something went wrong. Please try again.",
    "network.unreachable": "Cannot reach the server. Check your connection.",
    "network.timeout": "The request timed out. Please try again.",
    "auth.invalid_credentials": "Email or password is incorrect.",
    "auth.session_expired": "Your session has expired. Please sign in again.",
    "auth.session_revoked": "Your session was signed out. Please sign in again.",
    "projects.not_found": "Project not found.",
    "documents.not_found": "Document not found."
  }
  ```
- `packages/i18n/locales/de/errors.json` — complete German
  translations.
- `packages/i18n/locales/en/viewport.json`:
  ```json
  {
    "kernel.booting": "Booting kernel…",
    "kernel.error": "Kernel error: {{message}}",
    "mesh.summary": "{{triangles}} tri · hash {{hashPrefix}}…"
  }
  ```
- `packages/i18n/locales/de/viewport.json`:
  ```json
  {
    "kernel.booting": "Kernel wird geladen…",
    "kernel.error": "Kernel-Fehler: {{message}}",
    "mesh.summary": "{{triangles}} Dreiecke · Hash {{hashPrefix}}…"
  }
  ```

Every `de` file is a complete translation — zero keys fall back to
English — so the Slice 0b Playwright journey proves the catalog is
wired up (not that the fallback works).

**Acceptance**: Every catalog is valid JSON (checked by the format
gate), the keys in every `de/*.json` match the keys in the
corresponding `en/*.json` 1:1.

### W4. Resources type augmentation + module declaration

**Files**

- `packages/i18n/src/resources.ts`:

  ```ts
  import commonEn from '../locales/en/common.json';
  import errorsEn from '../locales/en/errors.json';
  import viewportEn from '../locales/en/viewport.json';
  import commonDe from '../locales/de/common.json';
  import errorsDe from '../locales/de/errors.json';
  import viewportDe from '../locales/de/viewport.json';

  export const resources = {
    en: { common: commonEn, errors: errorsEn, viewport: viewportEn },
    de: { common: commonDe, errors: errorsDe, viewport: viewportDe },
  } as const;

  export type Resources = typeof resources.en;
  ```

- `packages/i18n/src/i18next.d.ts` — module augmentation:

  ```ts
  import type { Resources } from './resources.js';

  declare module 'i18next' {
    interface CustomTypeOptions {
      defaultNS: 'common';
      resources: Resources;
    }
  }
  ```

**Acceptance**: Calling `t('viewport:kernel.booting')` in any consumer
typechecks; `t('viewport:does-not-exist')` fails `tsc --noEmit` with a
specific "not assignable" error pointing at the catalog namespace.

### W5. i18next instance factories — `createBrowserI18n()` + `createServerI18n()`

**Files**

- `packages/i18n/src/instance.ts`:

  ```ts
  import i18next, { type i18n as I18nInstance } from 'i18next';
  import ICU from 'i18next-icu';

  import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from './locales.js';
  import { resources } from './resources.js';
  import { createCookieLanguageDetector } from './detector.js';

  export interface BrowserI18nOptions {
    readonly initialLocale?: Locale;
  }

  export async function createBrowserI18n(options: BrowserI18nOptions = {}): Promise<I18nInstance> {
    const instance = i18next.createInstance();
    await instance
      .use(ICU)
      .use(createCookieLanguageDetector())
      .init({
        resources,
        supportedLngs: SUPPORTED_LOCALES,
        fallbackLng: DEFAULT_LOCALE,
        lng: options.initialLocale,
        defaultNS: 'common',
        ns: ['common', 'errors', 'viewport'],
        interpolation: { escapeValue: false }, // React already escapes
        detection: {
          order: ['custom-cookie', 'localStorage', 'navigator'],
          caches: ['cookie', 'localStorage'],
          lookupCookie: 'cad_locale',
          lookupLocalStorage: 'cad_locale',
          cookieSameSite: 'lax',
          cookieMaxAge: 60 * 60 * 24 * 365, // 1 year
        },
        returnNull: false,
      });
    return instance;
  }

  export interface ServerI18nOptions {
    readonly locale: Locale;
  }

  export async function createServerI18n(options: ServerI18nOptions): Promise<I18nInstance> {
    const instance = i18next.createInstance();
    await instance.use(ICU).init({
      resources,
      supportedLngs: SUPPORTED_LOCALES,
      fallbackLng: DEFAULT_LOCALE,
      lng: options.locale,
      defaultNS: 'common',
      ns: ['common', 'errors', 'viewport'],
      interpolation: { escapeValue: false },
      returnNull: false,
    });
    return instance;
  }
  ```

- `packages/i18n/test/instance.test.ts`:
  - `createBrowserI18n({ initialLocale: 'de' })` resolves
    `t('viewport:kernel.booting')` to `"Kernel wird geladen…"`.
  - `createBrowserI18n({ initialLocale: 'en' })` resolves
    `t('viewport:kernel.booting')` to `"Booting kernel…"`.
  - `createServerI18n({ locale: 'de' })` produces an instance whose
    `t('errors:auth.invalid_credentials')` returns the German
    translation.
  - Missing key in a namespace falls back to English and does not
    throw (`returnNull: false`).
  - Two instances created back-to-back do not share state (caller
    state is fully isolated — important for Fastify request-scoped
    usage in Slice 1).

**Acceptance**: All tests pass; coverage ≥ 90% on `instance.ts`.

### W6. Cookie-first language detector

**Files**

- `packages/i18n/src/detector.ts`:

  ```ts
  import type { CustomDetector } from 'i18next-browser-languagedetector';

  import { isSupportedLocale } from './locales.js';

  const COOKIE_NAME = 'cad_locale';

  function readCookie(name: string): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, 'u'));
    return match?.[1];
  }

  function writeCookie(name: string, value: string): void {
    if (typeof document === 'undefined') return;
    const oneYearSeconds = 60 * 60 * 24 * 365;
    document.cookie = `${name}=${value}; Path=/; Max-Age=${oneYearSeconds}; SameSite=Lax`;
  }

  export function createCookieLanguageDetector(): CustomDetector {
    return {
      name: 'custom-cookie',
      lookup() {
        const value = readCookie(COOKIE_NAME);
        return isSupportedLocale(value) ? value : undefined;
      },
      cacheUserLanguage(locale) {
        if (isSupportedLocale(locale)) {
          writeCookie(COOKIE_NAME, locale);
        }
      },
    };
  }
  ```

- `packages/i18n/test/detector.test.ts` — uses happy-dom's
  `document.cookie` to:
  - Set `cad_locale=de`, call `lookup()`, expect `'de'`
  - Set `cad_locale=xx` (unsupported), call `lookup()`, expect `undefined`
  - No cookie set, call `lookup()`, expect `undefined`
  - `cacheUserLanguage('de')` sets the cookie with `Path=/` +
    `SameSite=Lax`
  - `cacheUserLanguage('xx')` does nothing (unsupported locales are
    never written)

**Acceptance**: All tests pass; the cookie read/write round-trip
works in happy-dom.

### W7. React wiring — `<I18nProvider>` + `useT()` + `<Trans>`

**Files**

- `packages/i18n/src/react.tsx`:

  ```tsx
  import { I18nextProvider, useTranslation, Trans as I18nextTrans } from 'react-i18next';
  import type { i18n as I18nInstance } from 'i18next';
  import type { ReactNode } from 'react';

  import type { Resources } from './resources.js';

  export type Namespace = keyof Resources;

  export interface I18nProviderProps {
    readonly i18n: I18nInstance;
    readonly children: ReactNode;
  }

  export function I18nProvider({ i18n, children }: I18nProviderProps): React.JSX.Element {
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  }

  export function useT<N extends Namespace>(namespace: N) {
    return useTranslation(namespace);
  }

  // Re-export Trans with the same typing — consumers import it from @cad/i18n.
  export const Trans = I18nextTrans;
  ```

- `packages/i18n/src/index.ts` — barrel re-exports:

  ```ts
  export { createBrowserI18n, createServerI18n } from './instance.js';
  export type { BrowserI18nOptions, ServerI18nOptions } from './instance.js';
  export { I18nProvider, useT, Trans } from './react.js';
  export type { I18nProviderProps, Namespace } from './react.js';
  export { SUPPORTED_LOCALES, DEFAULT_LOCALE, isSupportedLocale } from './locales.js';
  export type { Locale } from './locales.js';
  ```

- `packages/i18n/test/react.test.tsx`:
  - Render `<I18nProvider i18n={await createBrowserI18n({ initialLocale: 'en' })}>{children}</I18nProvider>` with a child that calls
    `const { t } = useT('viewport')` and renders
    `t('kernel.booting')` → asserts `"Booting kernel…"` in the DOM.
  - Same test with `initialLocale: 'de'` → asserts
    `"Kernel wird geladen…"`.
  - `useT('errors').t('auth.invalid_credentials')` in en and de.

**Acceptance**: All component tests pass in happy-dom.

### W8. Root extractor config + `pnpm i18n:extract` / `i18n:check`

**Files**

- `i18next-parser.config.js` at repo root (CommonJS — older
  `i18next-parser` still requires CJS config):
  ```js
  /** @type {import('i18next-parser').UserConfig} */
  module.exports = {
    locales: ['en', 'de'],
    output: 'packages/i18n/locales/$LOCALE/$NAMESPACE.json',
    input: [
      'apps/web/src/**/*.{ts,tsx}',
      'apps/server/src/**/*.ts', // Slice 1 onward
      'packages/i18n/src/**/*.{ts,tsx}',
    ],
    defaultNamespace: 'common',
    namespaceSeparator: ':',
    keySeparator: '.',
    sort: true,
    createOldCatalogs: false,
    failOnUpdate: false,
    failOnWarnings: true,
    verbose: false,
    lexers: {
      ts: ['JavascriptLexer'],
      tsx: ['JsxLexer'],
      default: ['JavascriptLexer'],
    },
  };
  ```
- Root `package.json` scripts:
  - `"i18n:extract": "i18next --config i18next-parser.config.js"` —
    writes updated catalogs to disk
  - `"i18n:check": "i18next --config i18next-parser.config.js --fail-on-update"` —
    runs in CI; exits non-zero if the catalogs would change (i.e.,
    a source file has a new key that's not in `en`)
- Root `package.json` `devDependencies`: `i18next-parser@^9`.

**Acceptance**: `pnpm i18n:check` exits zero after W9's migration
because every Slice 0 + 0b source string has a matching catalog
entry. Deliberately introducing a new `t('viewport:not-in-catalog')`
call in `Viewport.tsx` and re-running the check fails with a clear
diff.

### W9. `apps/web` wiring — `<I18nProvider>` + `i18n.ts` bootstrap

**Dependencies**: `@cad/i18n` (workspace), `i18next@^23`,
`react-i18next@^15`, `i18next-browser-languagedetector@^8`,
`i18next-icu@^2`.

**Files**

- `apps/web/src/i18n.ts`:

  ```ts
  import { createBrowserI18n } from '@cad/i18n';

  export const i18nInstancePromise = createBrowserI18n();
  ```

- `apps/web/src/main.tsx` — extended to:

  ```tsx
  import { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import { I18nProvider } from '@cad/i18n';

  import { App } from './App.js';
  import { i18nInstancePromise } from './i18n.js';

  import './index.css';

  const root = document.querySelector('#root');
  if (!(root instanceof HTMLElement)) {
    throw new TypeError('@cad/web: #root element not found in index.html');
  }

  // Boot i18n before rendering so the first paint is in the correct locale.
  const i18n = await i18nInstancePromise;

  createRoot(root).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
  ```

- `apps/web/package.json` — adds `@cad/i18n`, `i18next`,
  `react-i18next`, `i18next-browser-languagedetector`, `i18next-icu`
  to `dependencies`.

**Acceptance**: `pnpm --filter @cad/web dev` boots; the first paint
is in the correct locale based on the current cookie/localStorage
state; setting `document.cookie = 'cad_locale=de; Path=/'` and
reloading switches the overlay to German.

### W10. Slice 0 migration — `Viewport.tsx` overlays

**Files**

- `apps/web/src/viewport/Viewport.tsx` — extended:

  ```tsx
  import { useT } from '@cad/i18n';
  // ... other imports unchanged

  export function Viewport({ box }: ViewportProps): React.JSX.Element {
    const { t } = useT('viewport');
    // ... hook/effect wiring unchanged

    return (
      <div data-tessellation-hash={result?.metadata.hash ?? ''} style={VIEWPORT_STYLE}>
        <canvas ref={canvasRef} style={CANVAS_STYLE} />
        {pending && !error && <div style={OVERLAY_STYLE}>{t('kernel.booting')}</div>}
        {error && <div style={ERROR_STYLE}>{t('kernel.error', { message: error })}</div>}
        {result && (
          <div style={OVERLAY_STYLE}>
            {t('mesh.summary', {
              triangles: result.metadata.triangleCount,
              hashPrefix: result.metadata.hash.slice(0, 12),
            })}
          </div>
        )}
      </div>
    );
  }
  ```

- `apps/web/test/Viewport.test.tsx` — renders the viewport inside a
  test `<I18nProvider>` with a locale prop, asserts the translated
  strings appear for both `en` and `de`.

**Acceptance**: The `useT` hook resolves every string. The visual
overlay text matches the committed `en` and `de` catalogs. The
tessellation hash on the root `<div>` is unchanged — geometry is
language-free.

### W11. `<LanguageSwitcher>` component (hidden until Slice 11)

**Files**

- `apps/web/src/components/LanguageSwitcher.tsx`:

  ```tsx
  import { useT, SUPPORTED_LOCALES, type Locale } from '@cad/i18n';

  export function LanguageSwitcher(): React.JSX.Element {
    const { i18n } = useT('common');
    const active = i18n.language as Locale;

    return (
      <div role="group" aria-label="Language">
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={active === locale}
            onClick={() => {
              void i18n.changeLanguage(locale);
            }}
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }
  ```

- `apps/web/test/LanguageSwitcher.test.tsx` — renders the component
  inside an `<I18nProvider>`, clicks each button, asserts the cookie
  is updated and `i18n.language` changes.

Not rendered anywhere in the Slice 0b app (the component is exported
and tested but `<App />` never mounts it). Slice 11 imports it when
the top bar lands.

**Acceptance**: Component test passes; clicking each button updates
the cookie + `i18n.language` in happy-dom.

### W12. Playwright — parameterize `box-renders` on locale

**Files**

- `tests/e2e/src/box-renders.spec.ts` — extended to use Playwright's
  parametric test pattern:

  ```ts
  import { expect, test } from '@playwright/test';

  const LOCALES = [
    { code: 'en', kernelBootingLabel: 'Booting kernel…' },
    { code: 'de', kernelBootingLabel: 'Kernel wird geladen…' },
  ] as const;

  const EXPECTED_HASH_10x20x30 = 'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0';

  for (const locale of LOCALES) {
    test(`box renders in ${locale.code}`, async ({ context, page }) => {
      await context.addCookies([
        {
          name: 'cad_locale',
          value: locale.code,
          url: 'http://127.0.0.1:4173',
          sameSite: 'Lax',
        },
      ]);

      // ... existing assertions: page.goto('/'), wait for data-tessellation-hash
      // to equal EXPECTED_HASH_10x20x30, canvas visible, no console errors.

      // NEW: assert the mesh.summary overlay reflects the locale. Kernel boot
      // is too fast to reliably catch the "Booting kernel…" state; we only
      // check the final rendered state.
      const overlay = page.getByText(locale.code === 'en' ? / tri · hash/u : / Dreiecke · Hash/u);
      await expect(overlay).toBeVisible();
    });
  }
  ```

Playwright counts this as 2 tests (one per parameter) against the
≤10 budget, leaving slack for Slice 1 onward.

**Acceptance**: `pnpm test:e2e` runs both locale parameters; each
passes in ≤30 s; the HTML report shows two test entries under the
`box-renders` describe.

### W13. CI — `i18n-check` job

**Files**

- `.github/workflows/ci.yml` — add a new job:
  ```yaml
  i18n-check:
    name: i18n catalog check
    needs: setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm i18n:check
  ```

**Acceptance**: Pushing a branch with a new `t('viewport:does-not-exist')`
call makes the `i18n-check` job fail; removing the call makes it
pass.

### W14. Verification checklist

**Files**

- `docs/verification/slice-0b.md` — manual checklist mirroring the
  Definition of Done, including:
  - Set `document.cookie = 'cad_locale=de; Path=/'`, reload, confirm
    the overlay switches to German
  - Clear the cookie, reload, confirm the overlay reverts to English
    via browser `Accept-Language` detection (assuming the browser is
    English; the checklist calls out how to simulate a German browser
    via Chromium's `--accept-lang=de` flag)
  - `pnpm i18n:check` exits zero after a clean install
  - Deliberately break it by adding a new `t(...)` call without a
    catalog entry, re-run, confirm the failure message is readable
  - Every Slice 0 CI job stays green

**Acceptance**: Checklist runs green on one macOS laptop and one
Linux VM; every box ticked.

## Key Technical Decisions (locked for Slice 0b)

| Concern               | Choice                                                                                                     | Reason                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Library**           | **`react-i18next@^15` + `i18next@^23`**                                                                    | Most mature React binding; universal core runs in browser, Fastify, Web Workers, Node; best translation-service ecosystem; battle-tested with React 19.                                           |
| **Catalog format**    | JSON namespace files (`locales/<lang>/<ns>.json`)                                                          | Industry-standard interchange; accepted by Crowdin / Lokalise / Transifex / Weblate natively.                                                                                                     |
| **Extraction**        | `i18next-parser@^9` (dev only)                                                                             | Deterministic output, merge-friendly, CLI-first, integrates with the `i18n:check` CI gate.                                                                                                        |
| **Type safety**       | `declare module 'i18next'` resource augmentation                                                           | Compile-time `t('ns:key')` checking with zero runtime cost. No codegen package.                                                                                                                   |
| **Launch locales**    | `en` (source) + `de` (complete first translation)                                                          | English required; German chosen for user affiliation (rwth-aachen.de) + BambuLab market alignment. Third language is a one-line addition.                                                         |
| **URL convention**    | **No locale in URL — `cad_locale` cookie + localStorage only**                                             | URLs stay stable across languages; no React Router locale segment; the server reads the same cookie to translate error envelopes.                                                                 |
| **Cookie shape**      | `cad_locale=<en\|de>; Path=/; Max-Age=31536000; SameSite=Lax`                                              | Must be readable by client JS (language switcher writes it without a round-trip). Not sensitive data — `HttpOnly` is unnecessary; `Lax` is enough (no CSRF risk — it controls display, not auth). |
| **Locale detection**  | Custom cookie-first detector → localStorage → `navigator.language` → `en` fallback                         | Cookie is authoritative; localStorage syncs across tabs; browser hint is only the initial bootstrap.                                                                                              |
| **Loading strategy**  | Bundled statically at Slice 0b scope (3 namespaces, <5 KB per locale)                                      | Simple; scales to lazy loading via `i18next-http-backend` from Slice 4+ when the catalog crosses ~50 KB.                                                                                          |
| **Server runtime**    | `createServerI18n({ locale })` per request; Slice 1 attaches `request.t` via a cookie-aware onRequest hook | Request-scoped; no global mutable locale state; cookie-first resolution so the server matches what the client displays.                                                                           |
| **Error envelope**    | `@cad/protocol` `ErrorEnvelopeSchema` grows an optional `i18nKey` field in Slice 1                         | Server sends machine-parseable code + English fallback in `message`; client re-translates using the active locale.                                                                                |
| **Source language**   | English                                                                                                    | Industry default; every dev writes the English key inline (`t('auth.invalid_credentials')`); `i18next-parser` extracts to `locales/en/*.json`.                                                    |
| **Fallback language** | English                                                                                                    | If a key is missing in `de`, the `en` value renders and a dev console warning fires.                                                                                                              |
| **Pluralization**     | ICU MessageFormat via `i18next-icu@^2`                                                                     | Handles complex cases (Slavic plurals, fractional plurals) without hand-rolled logic.                                                                                                             |
| **Number + date**     | `Intl.NumberFormat` / `Intl.DateTimeFormat` via `i18next`'s built-in interpolator                          | Native, no extra package, locale-aware.                                                                                                                                                           |
| **CLI scope**         | English-only; `apps/cli` does not depend on `@cad/i18n`                                                    | Developer tool. Localizing a CLI is a cost without a user win.                                                                                                                                    |
| **Kernel errors**     | English developer messages; surfaced to web users via the server error envelope's `i18nKey`                | Zod validation messages are for developers. Real user-facing errors get human-friendly i18n keys (Slice 1 onward).                                                                                |

**Not yet introduced** (avoid scope creep): `i18next-http-backend`,
lazy namespace loading, `typesafe-i18n`, Lingui, Paraglide, AI-assisted
translation, right-to-left locales, regional variants (`en-GB` vs
`en-US`), pluralization rules beyond the ICU standard, translation-
memory integration, handbook content localization. All land in later
slices or stay explicitly out of scope.

## Testing Strategy (specific to Slice 0b)

| Layer              | What it exercises at Slice 0b                                                                                                | File(s)                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Unit               | `locales.ts` type narrowing, `isSupportedLocale` edges, cookie read/write round-trip in happy-dom                            | `packages/i18n/test/{locales,detector}.test.ts`      |
| Integration (i18n) | `createBrowserI18n()` + `createServerI18n()` resolve keys correctly for both locales, fallback works, instances are isolated | `packages/i18n/test/instance.test.ts`                |
| Component (i18n)   | `<I18nProvider>` + `useT()` in happy-dom, `<Trans>` re-export                                                                | `packages/i18n/test/react.test.tsx`                  |
| Component (web)    | `Viewport.tsx` renders correctly under both locales via a test `<I18nProvider>`, `LanguageSwitcher` updates state            | `apps/web/test/{Viewport,LanguageSwitcher}.test.tsx` |
| Catalog linting    | `i18next-parser` in check mode; every `t(...)` call in the tree has a catalog entry                                          | `pnpm i18n:check` (CI job)                           |
| UI e2e             | Parameterized `box-renders` — one run per locale; asserts both deterministic hash AND localized overlay label                | `tests/e2e/src/box-renders.spec.ts`                  |

Coverage gates enforced in CI:

- `packages/i18n` ≥ 90% lines / 85% branches (lib preset)
- `apps/web` stays at ≥ 70% lines / 60% branches (browser preset);
  the Slice 0b additions (i18n wiring) are exercised by the updated
  `Viewport.test.tsx` so the number does not drop

The Slice 0 Playwright budget of **≤10 tests, ≤3 min CI wall time**
still holds. Slice 0b consumes 2 test slots (the two locale
parameters of `box-renders`), leaving 8 for Slices 1–15.

## CI Pipeline Specification

Extends the Slice 0 matrix with one new job:

```
name: ci
on: [push, pull_request]

jobs:
  setup:       # unchanged
  lint:        needs: [setup]
  typecheck:   needs: [setup]
  test:        needs: [setup]                         # adds @cad/i18n coverage
  test-api:    needs: [setup]                         # unchanged
  test-e2e:    needs: [build]                         # runs 2 locale parameters
  i18n-check:  needs: [setup]                         # NEW
  audit:       needs: [setup]
  build:       needs: [typecheck]
```

Target: first-PR green run stays ≤ **10 minutes** end-to-end (the
`i18n-check` job is <30 s and runs in parallel with `lint` /
`typecheck`).

## Risks & Mitigations

| Risk                                                                                      | Likelihood | Impact | Mitigation                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `i18next` + `react-i18next` React 19 edge cases (`use()` semantics, concurrent rendering) | Low        | Med    | Both libraries explicitly document React 19 support in their changelogs; we cover the happy path via happy-dom component tests and the real browser via Playwright.        |
| Bundle-size creep from i18next runtime (~40 KB min+gzip)                                  | Low        | Low    | Slice 0b web bundle budget is not regression-gated yet; 40 KB is tolerable. Lazy loading via `i18next-http-backend` stays on the table for Slice 4+ if the catalog grows.  |
| Missing-key runtime errors silently falling back to the key name                          | Med        | Med    | `i18next-parser` in check mode on every PR catches this at compile time; `returnNull: false` ensures the English fallback always renders in dev; console warning fires.    |
| Catalog drift between `en` and `de` (German missing a key the dev just added)             | Med        | Med    | `pnpm i18n:extract` is idempotent and commits to both catalogs in parallel; the `i18n:check` gate fails if `en` has a key `de` doesn't (configurable via parser settings). |
| Cookie not readable from Vite preview's `http://127.0.0.1:4173` in Playwright             | Low        | High   | Playwright's `context.addCookies({ url, sameSite: 'Lax' })` API sets cookies for a specific origin; the test uses this explicitly rather than `document.cookie`.           |
| ICU pluralization rule mismatch (e.g., German genitive inflection)                        | Low        | Low    | Slice 0b catalog has no pluralized keys. When Slice 1 adds its first plural, it lands with a unit test that covers `en` and `de` plural forms.                             |
| `i18next-parser` CJS config + ESM monorepo interop                                        | Low        | Low    | `i18next-parser.config.js` at the repo root is an explicit CJS file (`module.exports`); the rest of the monorepo stays ESM.                                                |
| Slice 0 Playwright journey regresses while adapting to the locale parameter               | Med        | Med    | The existing assertion (tessellation hash) is preserved byte-for-byte; the new assertion (localized label) is additive. Both run per locale, one fails if either drifts.   |
| Server-side `createServerI18n` leaking locale state between requests                      | Low        | High   | Factory always calls `i18next.createInstance()` — never returns a shared instance. Unit test verifies two back-to-back calls produce isolated instances.                   |
| Storybook / MDX content localization surprise from Slice 4b                               | Low        | Low    | Slice 4b reuses this package's catalog format; any disagreement surfaces at Slice 4b planning time, not at execution.                                                      |

## Verification Runbook (`docs/verification/slice-0b.md`)

1. `git clean -fdx` and `pnpm install`
2. `pnpm -r typecheck`
3. `pnpm -r test`
4. `pnpm i18n:check` — exits zero
5. `pnpm lint:code`
6. `pnpm format:check`
7. `pnpm -r build`
8. `pnpm --filter @cad/web preview` — open
   `http://127.0.0.1:4173`, confirm the overlay reads
   "Booting kernel…" → "... tri · hash ..."
9. Open devtools → Application → Cookies → add
   `cad_locale=de; Path=/`, reload
10. Confirm the overlay reads "... Dreiecke · Hash ..."
11. Clear the cookie, reload, confirm it reverts to English
12. `pnpm test:e2e` — both locale parameters pass
13. Deliberately add a new `t('viewport:not-in-catalog')` call in
    `Viewport.tsx`, re-run `pnpm i18n:check`, confirm it fails with
    a readable diff; revert
14. Push to a branch, open a PR, wait for CI green — every new job
    (`i18n-check`) and every extended one (`test-e2e`, `test`) must
    pass
15. Screenshot the viewport in both locales, attach to PR description

Every step must pass before Slice 0b is called done.

## Exit Criteria → Gate into Slice 1

Slice 1 (Project & Document Lifecycle) may **begin only after**:

- This plan's Definition of Done is met
- CI has been green on `main` for at least one PR cycle after the
  Slice 0b merge commit
- `known-issues.md` has no P0 or P1 entries introduced by this slice
- `docs/verification/slice-0b.md` checklist has been run green on
  macOS + Linux
- The Slice 1 skeleton doc has been updated with the i18n contract
  (new DoD bullet, new W5b work item wiring `@cad/i18n` into Fastify,
  extended W9/W12/W13)

## Retrospective (fill in after the slice lands)

### What landed clean

- _(fill in)_

### What needs follow-up

- _(fill in)_

### Discovered issues (file in `known-issues.md`)

- _(fill in; link to the issue entry)_

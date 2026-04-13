/**
 * i18next instance factories for the browser and the server.
 *
 * Both factories call `i18next.createInstance()` — no reliance on
 * the global default instance. This is load-bearing for Slice 1's
 * Fastify server, which clones a fresh instance per request so
 * concurrent handlers never race on the active language. The same
 * isolation helps tests, workers, and embedded scenarios.
 *
 * The browser factory wires the cookie-first custom detector from
 * `detector.ts` + i18next's built-in `localStorage` / `navigator`
 * fallbacks. The server factory accepts an explicit `locale` since
 * it has no DOM to read from — the caller (typically Fastify's
 * request-scoped hook in Slice 1) resolves the locale from the
 * request cookie or `Accept-Language` header and passes it in.
 */

import i18next, { type i18n as I18nInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import ICU from 'i18next-icu';

import { createCookieLanguageDetector } from './detector.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from './locales.js';
import { resources } from './resources.js';

const NAMESPACES = ['common', 'errors', 'viewport'] as const;
const DEFAULT_NAMESPACE = 'common';

export interface BrowserI18nOptions {
  /**
   * Force a specific locale at construction time, bypassing the
   * detection chain. Primarily for tests and Storybook. When
   * omitted, the detection chain runs: cookie → localStorage →
   * navigator → English fallback.
   */
  readonly initialLocale?: Locale;
}

/**
 * Build a browser-side i18next instance with the cookie-first
 * detector + ICU plural support.
 */
export async function createBrowserI18n(options: BrowserI18nOptions = {}): Promise<I18nInstance> {
  const detector = new LanguageDetector();
  detector.addDetector(createCookieLanguageDetector());

  const instance = i18next.createInstance();
  await instance
    .use(ICU)
    .use(detector)
    .init({
      resources,
      supportedLngs: [...SUPPORTED_LOCALES],
      fallbackLng: DEFAULT_LOCALE,
      ...(options.initialLocale === undefined ? {} : { lng: options.initialLocale }),
      defaultNS: DEFAULT_NAMESPACE,
      ns: [...NAMESPACES],
      interpolation: { escapeValue: false },
      detection: {
        order: ['cad-cookie', 'localStorage', 'navigator'],
        caches: ['cookie', 'localStorage'],
        lookupCookie: 'cad_locale',
        lookupLocalStorage: 'cad_locale',
        cookieMinutes: 60 * 24 * 365, // 1 year
        cookieOptions: { path: '/', sameSite: 'lax' },
      },
      returnNull: false,
    });
  return instance;
}

export interface ServerI18nOptions {
  /** Active locale for this instance — resolved by the caller. */
  readonly locale: Locale;
}

/**
 * Build a server-side i18next instance bound to a specific locale.
 *
 * No detection chain — the server is given the locale upfront by
 * whatever resolves it from the request (cookie, header, user
 * preference). Slice 1's Fastify plugin calls this factory per
 * request so every handler sees a stable, isolated `request.t`.
 */
export async function createServerI18n(options: ServerI18nOptions): Promise<I18nInstance> {
  const instance = i18next.createInstance();
  await instance.use(ICU).init({
    resources,
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    lng: options.locale,
    defaultNS: DEFAULT_NAMESPACE,
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}

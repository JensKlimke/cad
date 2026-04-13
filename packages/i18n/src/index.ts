/**
 * Public surface of `@cad/i18n`.
 *
 * Wave B (landed): locale registry, static catalog, i18next instance
 * factories, cookie-first language detector, typed React provider +
 * `useT` hook. `apps/web` consumes this barrel in Wave C.
 */

export { createCookieLanguageDetector } from './detector.js';
export { createBrowserI18n, createServerI18n } from './instance.js';
export type { BrowserI18nOptions, ServerI18nOptions } from './instance.js';
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, isSupportedLocale, type Locale } from './locales.js';
export { I18nProvider, Trans, useT } from './react.js';
export type { I18nProviderProps, Namespace } from './react.js';
export { resources, type Resources } from './resources.js';

/**
 * Cookie-first language detector for `i18next-browser-languagedetector`.
 *
 * The cookie is the authoritative source of truth for the active
 * locale: both the browser and the server read it, the client
 * writes it, and the client is free to mirror it into `localStorage`
 * for cross-tab sync via i18next's built-in `localStorage` cache.
 *
 * The detector is SSR-safe — `typeof document === 'undefined'`
 * short-circuits both read and write so the same module can be
 * imported from non-browser code (tests, server bootstrap, Workers)
 * without throwing.
 *
 * Cookie shape:
 *   name      `cad_locale`
 *   value     one of {@link SUPPORTED_LOCALES}
 *   Path      `/`
 *   Max-Age   31536000 (1 year)
 *   SameSite  `Lax`
 *   HttpOnly  no — the client needs to read + write this value
 *
 * Unsupported values are silently ignored on read **and** on write,
 * so a stale cookie left by a removed language cannot corrupt the
 * active locale — the detection chain falls through to the next
 * strategy (`localStorage` → `navigator` → English fallback).
 */

import { isSupportedLocale } from './locales.js';

import type { CustomDetector } from 'i18next-browser-languagedetector';

const COOKIE_NAME = 'cad_locale';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const match = new RegExp(String.raw`(?:^|;\s*)` + escaped + '=([^;]+)', 'u').exec(
    document.cookie,
  );
  return match?.[1];
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.cookie = `${name}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Build a `CustomDetector` that reads and writes the `cad_locale`
 * cookie. Consumers register it via
 * `new LanguageDetector().addDetector(createCookieLanguageDetector())`.
 */
export function createCookieLanguageDetector(): CustomDetector {
  return {
    name: 'cad-cookie',
    lookup() {
      const value = readCookie(COOKIE_NAME);
      return isSupportedLocale(value) ? value : undefined;
    },
    cacheUserLanguage(locale: string) {
      if (isSupportedLocale(locale)) {
        writeCookie(COOKIE_NAME, locale);
      }
    },
  };
}

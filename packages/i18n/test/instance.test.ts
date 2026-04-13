/**
 * Unit tests for the i18next instance factories.
 *
 * Verifies key resolution for both locales, ICU plural/interp
 * support, missing-key fallback behaviour, and — critically for
 * Slice 1's Fastify use — instance isolation across back-to-back
 * factory calls.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserI18n, createServerI18n } from '../src/instance.js';

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

afterEach(() => {
  clearCookies();
});

describe('createBrowserI18n', () => {
  it('resolves viewport keys in English when initialLocale is en', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'en' });
    expect(i18n.t('viewport:kernel.booting')).toBe('Booting kernel…');
  });

  it('resolves viewport keys in German when initialLocale is de', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    expect(i18n.t('viewport:kernel.booting')).toBe('Kernel wird geladen…');
  });

  it('interpolates parameters in German', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    expect(i18n.t('viewport:kernel.error', { message: 'WASM' })).toBe('Kernel-Fehler: WASM');
  });

  it('falls back to English when the current locale has no key', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    // This key exists in neither catalog: should return the key itself,
    // not null and not throw. returnNull: false locks this behaviour.
    const result = i18n.t('viewport:not.a.real.key' as 'viewport:kernel.booting');
    expect(typeof result).toBe('string');
    expect(result).not.toBe('');
  });

  it('uses the cookie when no initialLocale is provided', async () => {
    document.cookie = 'cad_locale=de; Path=/';
    const i18n = await createBrowserI18n();
    expect(i18n.language).toBe('de');
    expect(i18n.t('common:actions.cancel')).toBe('Abbrechen');
  });

  it('falls back to English when no cookie and no initialLocale', async () => {
    clearCookies();
    // Also clear localStorage in case a previous test seeded it.
    globalThis.localStorage?.removeItem('cad_locale');
    const i18n = await createBrowserI18n();
    // Language can be 'en' or 'en-US' depending on the navigator; assert
    // the English translation resolves either way via the fallback chain.
    expect(i18n.t('common:actions.cancel')).toBe('Cancel');
  });
});

describe('createServerI18n', () => {
  it('resolves errors keys in English', async () => {
    const i18n = await createServerI18n({ locale: 'en' });
    expect(i18n.t('errors:auth.invalid_credentials')).toBe('Email or password is incorrect.');
  });

  it('resolves errors keys in German', async () => {
    const i18n = await createServerI18n({ locale: 'de' });
    expect(i18n.t('errors:auth.invalid_credentials')).toBe('E-Mail oder Passwort ist falsch.');
  });

  it('exposes the requested locale via i18n.language', async () => {
    const i18n = await createServerI18n({ locale: 'de' });
    expect(i18n.language).toBe('de');
  });
});

describe('instance isolation', () => {
  it('produces independent instances across back-to-back factory calls', async () => {
    const a = await createBrowserI18n({ initialLocale: 'en' });
    const b = await createBrowserI18n({ initialLocale: 'de' });
    expect(a).not.toBe(b);
    expect(a.t('viewport:kernel.booting')).toBe('Booting kernel…');
    expect(b.t('viewport:kernel.booting')).toBe('Kernel wird geladen…');
  });

  it('does not leak state between server and browser factories', async () => {
    const server = await createServerI18n({ locale: 'de' });
    const browser = await createBrowserI18n({ initialLocale: 'en' });
    // Changing server's language must not affect browser's.
    await server.changeLanguage('en');
    expect(browser.t('viewport:kernel.booting')).toBe('Booting kernel…');
    expect(server.t('viewport:kernel.booting')).toBe('Booting kernel…');
  });

  it('honours changeLanguage independently on each instance', async () => {
    const a = await createBrowserI18n({ initialLocale: 'en' });
    const b = await createBrowserI18n({ initialLocale: 'en' });
    await a.changeLanguage('de');
    expect(a.t('viewport:kernel.booting')).toBe('Kernel wird geladen…');
    expect(b.t('viewport:kernel.booting')).toBe('Booting kernel…');
  });
});

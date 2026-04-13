/**
 * Unit tests for the locale registry.
 *
 * Drives `src/locales.ts` to 100% line + branch coverage so
 * @cad/i18n meets the `lib` preset's 90/85 floor from the first
 * commit.
 *
 * Three invariants:
 *
 *   1. Every `SUPPORTED_LOCALES` member passes `isSupportedLocale`.
 *   2. `DEFAULT_LOCALE` is itself supported.
 *   3. Everything else is rejected — non-strings, unsupported
 *      codes, empty strings, and case variants.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type Locale,
} from '../src/locales.js';

describe('SUPPORTED_LOCALES', () => {
  it('contains at least the launch pair (en + de)', () => {
    expect(SUPPORTED_LOCALES).toContain('en');
    expect(SUPPORTED_LOCALES).toContain('de');
  });

  it('has no duplicate entries', () => {
    const unique = new Set(SUPPORTED_LOCALES);
    expect(unique.size).toBe(SUPPORTED_LOCALES.length);
  });
});

describe('DEFAULT_LOCALE', () => {
  it('is a member of SUPPORTED_LOCALES', () => {
    expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('is English (the source language)', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});

describe('isSupportedLocale', () => {
  it('accepts every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
    }
  });

  it('narrows the value type to Locale when true', () => {
    const candidate: unknown = 'de';
    // Ternary, not an if-branch expect: the `satisfies` provides
    // compile-time proof that `candidate` is narrowed to `Locale`
    // inside the truthy path.
    const narrowed: Locale | null = isSupportedLocale(candidate)
      ? (candidate satisfies Locale)
      : null;
    expect(narrowed).toBe('de');
  });

  it.each([
    ['unsupported code', 'xx'],
    ['empty string', ''],
    ['uppercase variant', 'EN'],
    ['mixed-case variant', 'De'],
    ['locale with region', 'en-US'],
    ['whitespace', ' en'],
  ])('rejects string that is not a supported ISO code: %s', (_label, value) => {
    expect(isSupportedLocale(value)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['boolean', true],
    ['plain object', { locale: 'en' }],
    ['array', ['en']],
    ['symbol', Symbol('en')],
  ])('rejects non-string input: %s', (_label, value) => {
    expect(isSupportedLocale(value)).toBe(false);
  });
});

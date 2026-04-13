/**
 * Unit tests for the cookie-first language detector.
 *
 * Drives `src/detector.ts` over happy-dom's `document.cookie` to
 * cover the full round-trip: lookup on supported / unsupported /
 * missing cookies, cache-on-supported / no-op-on-unsupported, and
 * the SSR-safe short-circuits.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createCookieLanguageDetector } from '../src/detector.js';

const COOKIE_NAME = 'cad_locale';

function clearCookie(): void {
  // happy-dom's cookie store persists entries even with Max-Age=0;
  // iterate and expire every named cookie so tests start clean.
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

function setCookie(value: string): void {
  document.cookie = `${COOKIE_NAME}=${value}; Path=/`;
}

afterEach(() => {
  clearCookie();
});

describe('createCookieLanguageDetector → lookup()', () => {
  it('returns the cookie value when it is a supported locale', () => {
    setCookie('de');
    const detector = createCookieLanguageDetector();
    expect(detector.lookup({})).toBe('de');
  });

  it('returns undefined when the cookie holds an unsupported value', () => {
    setCookie('xx');
    const detector = createCookieLanguageDetector();
    expect(detector.lookup({})).toBeUndefined();
  });

  it('returns undefined when the cookie is absent', () => {
    clearCookie();
    const detector = createCookieLanguageDetector();
    expect(detector.lookup({})).toBeUndefined();
  });

  it('reads even when another cookie is set on the same domain', () => {
    setCookie('en');
    document.cookie = 'other_value=something; Path=/';
    const detector = createCookieLanguageDetector();
    expect(detector.lookup({})).toBe('en');
  });
});

describe('createCookieLanguageDetector → cacheUserLanguage()', () => {
  it('writes the cookie for a supported locale', () => {
    clearCookie();
    const detector = createCookieLanguageDetector();
    detector.cacheUserLanguage?.('de', {});
    expect(document.cookie).toContain(`${COOKIE_NAME}=de`);
  });

  it('is a no-op for an unsupported locale', () => {
    clearCookie();
    const detector = createCookieLanguageDetector();
    detector.cacheUserLanguage?.('xx', {});
    // Semantic check: lookup must not surface the rejected value.
    expect(detector.lookup({})).toBeUndefined();
  });

  it('does not overwrite an existing supported locale with an unsupported one', () => {
    setCookie('de');
    const detector = createCookieLanguageDetector();
    detector.cacheUserLanguage?.('xx', {});
    expect(detector.lookup({})).toBe('de');
  });

  it('round-trips a write through lookup', () => {
    clearCookie();
    const detector = createCookieLanguageDetector();
    detector.cacheUserLanguage?.('en', {});
    expect(detector.lookup({})).toBe('en');
  });
});

describe('createCookieLanguageDetector → SSR safety', () => {
  it('is safe when document is undefined (lookup)', () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error — simulating a non-DOM environment for SSR coverage
    delete globalThis.document;
    try {
      const detector = createCookieLanguageDetector();
      expect(detector.lookup({})).toBeUndefined();
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it('is safe when document is undefined (cacheUserLanguage)', () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error — simulating a non-DOM environment for SSR coverage
    delete globalThis.document;
    try {
      const detector = createCookieLanguageDetector();
      expect(() => detector.cacheUserLanguage?.('de', {})).not.toThrow();
    } finally {
      globalThis.document = originalDocument;
    }
  });
});

describe('detector metadata', () => {
  it('exposes a stable name', () => {
    expect(createCookieLanguageDetector().name).toBe('cad-cookie');
  });
});

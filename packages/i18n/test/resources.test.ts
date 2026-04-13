/**
 * Unit tests for the static resource map + type augmentation.
 *
 * Two invariants:
 *
 *   1. **Key parity**: every translated locale has the same set of
 *      keys (per namespace) as the English source. A missing German
 *      key fails here, not at runtime.
 *   2. **Compile-time type safety**: the `Resources` type exported
 *      by `resources.ts` is structurally correct — the assertions
 *      below only typecheck if the shape matches.
 */

import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '../src/locales.js';
import { resources, type Resources } from '../src/resources.js';

const NAMESPACES = ['common', 'errors', 'viewport'] as const;
type Namespace = (typeof NAMESPACES)[number];

function sortedKeys(obj: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.keys(obj).toSorted();
}

describe('resources map', () => {
  it('contains an entry for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(resources).toHaveProperty(locale);
    }
  });

  it.each(NAMESPACES)('contains the "%s" namespace for every locale', (namespace) => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(resources[locale]).toHaveProperty(namespace);
    }
  });

  it.each(NAMESPACES)(
    'has identical keys across all locales for the "%s" namespace (parity)',
    (namespace: Namespace) => {
      const englishKeys = sortedKeys(resources.en[namespace]);
      for (const locale of SUPPORTED_LOCALES) {
        const localeKeys = sortedKeys(resources[locale][namespace]);
        expect(localeKeys).toEqual(englishKeys);
      }
    },
  );

  it('exposes non-empty translation values in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const namespace of NAMESPACES) {
        for (const value of Object.values(resources[locale][namespace])) {
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('Resources type', () => {
  it('compiles with every namespace key as a string value', () => {
    // These assignments are compile-time proof that `Resources`
    // matches the English catalog's actual shape. If the type drifts
    // (e.g., someone renames `kernel.booting` without updating
    // `Resources`), tsc --noEmit fails before this test even runs.
    const viewportBooting: Resources['viewport']['kernel.booting'] =
      resources.en.viewport['kernel.booting'];
    const authError: Resources['errors']['auth.invalid_credentials'] =
      resources.en.errors['auth.invalid_credentials'];
    const ok: Resources['common']['actions.ok'] = resources.en.common['actions.ok'];

    expect(viewportBooting).toBe('Booting kernel…');
    expect(authError).toBe('Email or password is incorrect.');
    expect(ok).toBe('OK');
  });
});

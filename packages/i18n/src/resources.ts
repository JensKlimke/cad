/**
 * Static resource map for every language + namespace the build ships.
 *
 * `i18next` reads this map at instance construction time; it is also
 * the single source of truth for the `Resources` type that the
 * module augmentation in `i18next.d.ts` feeds back into `i18next`'s
 * `CustomTypeOptions`, giving us compile-time `t('ns:key')` checks
 * across every consumer.
 *
 * Adding a language: import the new locale's JSON files and add a
 * top-level entry here. The `Locale` type in `locales.ts` narrows
 * automatically — everything else propagates through TypeScript.
 */

import commonDe from '../locales/de/common.json' with { type: 'json' };
import errorsDe from '../locales/de/errors.json' with { type: 'json' };
import viewportDe from '../locales/de/viewport.json' with { type: 'json' };
import commonEn from '../locales/en/common.json' with { type: 'json' };
import errorsEn from '../locales/en/errors.json' with { type: 'json' };
import viewportEn from '../locales/en/viewport.json' with { type: 'json' };

/**
 * Static i18next resource map indexed by locale → namespace → key.
 *
 * The `as const` is load-bearing: it locks the shape so
 * `typeof resources.en` is a precise object type suitable for
 * feeding back into i18next's `CustomTypeOptions.resources`.
 */
export const resources = {
  en: {
    common: commonEn,
    errors: errorsEn,
    viewport: viewportEn,
  },
  de: {
    common: commonDe,
    errors: errorsDe,
    viewport: viewportDe,
  },
} as const;

/**
 * Canonical resource shape derived from the English (source) catalog.
 *
 * Every translated locale must match this shape 1:1. The parity check
 * lives in `test/resources.test.ts` so a missing German key fails in
 * CI rather than at runtime.
 */
export type Resources = (typeof resources)['en'];

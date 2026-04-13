/**
 * Module augmentation for `i18next`'s `CustomTypeOptions`.
 *
 * Feeds the static {@link Resources} type back into i18next so that
 * every `t('namespace:key')` call across the monorepo is checked at
 * compile time — misspellings and missing keys fail `tsc --noEmit`
 * rather than producing silent fallback strings at runtime.
 *
 * Must be a `.d.ts` so it is picked up automatically by every
 * consumer of `@cad/i18n` without requiring a runtime import.
 */

import type { Resources } from './resources.js';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: Resources;
  }
}

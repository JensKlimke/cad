/**
 * Browser-side i18next instance bootstrap for `apps/web`.
 *
 * Exposed as a Promise so `main.tsx` can `await` it at the module
 * top level — React 19's concurrent root tolerates the wait and it
 * guarantees the first paint is in the correct locale (cookie →
 * localStorage → navigator → English fallback chain established in
 * [Slice 0b](../../../docs/slices/slice-0b-i18n-baseline.md)).
 *
 * Module-level construction is deliberate: exactly one instance per
 * browser session. Tests build their own instance via
 * `createBrowserI18n({ initialLocale })` to avoid depending on this
 * singleton.
 */

import { createBrowserI18n } from '@cad/i18n';

export const i18nInstancePromise = createBrowserI18n();

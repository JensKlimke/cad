/**
 * Locale registry for the CAD monorepo's i18n runtime.
 *
 * The single source of truth for "which languages does this build
 * support". Adding a language is a two-line change: append the ISO
 * code here and create a sibling catalog directory under
 * `packages/i18n/locales/<code>/`. The `Locale` type narrows
 * automatically via `as const` so every consumer picks up the
 * addition at compile time.
 *
 * See [Slice 0b](../../../docs/slices/slice-0b-i18n-baseline.md) for
 * the full rationale.
 */

/**
 * Every locale this build ships a complete catalog for. Order is
 * stable for UI presentation (language switcher in Slice 11).
 */
export const SUPPORTED_LOCALES = ['en', 'de'] as const;

/**
 * Union of ISO codes for every locale in {@link SUPPORTED_LOCALES}.
 * Narrows automatically when the array grows.
 */
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Locale used when detection fails, when a requested locale is
 * unsupported, or when a translation key is missing. English is the
 * source language — every catalog key exists here first.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Type guard that narrows an arbitrary value to {@link Locale}.
 *
 * Rejects non-strings, unsupported codes, empty strings, and
 * case-variants (`'EN'` is not accepted — ISO codes are lowercase
 * in this codebase).
 */
export function isSupportedLocale(value: unknown): value is Locale {
  if (typeof value !== 'string') {
    return false;
  }
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

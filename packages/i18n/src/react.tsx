/**
 * React bindings for `@cad/i18n`.
 *
 * Thin wrapper over `react-i18next` so consumers never import from
 * the underlying library directly — if we ever swap the runtime
 * (for instance, to Lingui or Paraglide) only this file changes.
 *
 * The `Namespace` type is derived from the static `Resources` type
 * in `resources.ts`, giving `useT(namespace)` compile-time safety
 * for both the namespace argument and the keys looked up through
 * the returned `t` function.
 */

import { I18nextProvider, Trans as I18nextTrans, useTranslation } from 'react-i18next';

import type { Resources } from './resources.js';
import type { i18n as I18nInstance } from 'i18next';
import type { ReactNode } from 'react';

/**
 * Union of every namespace in {@link Resources}.
 * Narrows automatically when a new namespace is added to the
 * resource map.
 */
export type Namespace = keyof Resources;

export interface I18nProviderProps {
  readonly i18n: I18nInstance;
  readonly children: ReactNode;
}

/**
 * Root provider that binds an i18next instance to React context.
 * Consumers mount this once near the root of their component tree
 * (typically in `apps/web/src/main.tsx`, added in Wave C).
 */
export function I18nProvider({ i18n, children }: I18nProviderProps): React.JSX.Element {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

/**
 * Typed hook for accessing translations from a specific namespace.
 *
 * The return type is inferred from `react-i18next`'s
 * `useTranslation` so that key-level narrowing from the i18next
 * module augmentation (`CustomTypeOptions.resources`) flows through
 * unchanged. Misspelled namespaces fail at compile time because of
 * the `N extends Namespace` bound.
 *
 * @example
 * ```tsx
 * const { t } = useT('viewport');
 * return <span>{t('kernel.booting')}</span>;
 * ```
 */
export function useT<N extends Namespace>(namespace: N): ReturnType<typeof useTranslation<N>> {
  return useTranslation(namespace);
}

/**
 * Re-export of `react-i18next`'s `<Trans>` component. Consumers use
 * it for rich-text translations with inline React elements.
 *
 * The explicit `typeof` annotation is load-bearing: without it,
 * TypeScript's "inferred type cannot be named without a reference
 * to a non-portable internal path" error fires because the Trans
 * type conditionally resolves to a type from `TransWithoutContext`.
 */
export const Trans: typeof I18nextTrans = I18nextTrans;

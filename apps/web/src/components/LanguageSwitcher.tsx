/**
 * Language switcher dropdown.
 *
 * Writes the selected locale into both `document.cookie` (the
 * authoritative source — the server will read it in Slice 1) and
 * i18next's active language (so the current tab re-renders without
 * a reload). `localStorage` is updated automatically by the
 * i18next cache chain configured in `@cad/i18n`.
 *
 * **Hidden until Slice 11.** The Slice 0 viewport has no top bar,
 * so mounting this component unconditionally would add visual noise
 * to the rotating-box demo. A feature-flag-gated `<TopBar>` lands
 * in Slice 11; until then, consumers can still mount the switcher
 * manually (the component works), but `App.tsx` does not.
 */

import {
  SUPPORTED_LOCALES,
  type createBrowserI18n,
  isSupportedLocale,
  useT,
  type Locale,
} from '@cad/i18n';
import { useCallback, type ChangeEvent } from 'react';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

export interface LanguageSwitcherProps {
  /**
   * The i18next instance to mutate. Required because the component
   * needs to call `changeLanguage()` on the same instance the
   * provider context holds — passing it explicitly keeps the
   * component pure and testable without a provider wrapper.
   */
  readonly i18n: I18nInstance;
}

const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  en: 'English',
  de: 'Deutsch',
};

export function LanguageSwitcher({ i18n }: LanguageSwitcherProps): React.JSX.Element {
  const { t } = useT('common');
  const activeLocale: Locale = isSupportedLocale(i18n.language) ? i18n.language : 'en';

  const onChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const next = event.target.value;
      if (!isSupportedLocale(next)) {
        return;
      }
      // i18next's cookie + localStorage caches (configured in
      // `@cad/i18n`) persist automatically as a side effect of
      // `changeLanguage`, so no direct DOM mutation is needed here.
      void i18n.changeLanguage(next);
    },
    [i18n],
  );

  return (
    <label>
      <span className="sr-only">{t('language.label')}</span>
      <select
        data-testid="language-switcher"
        value={activeLocale}
        onChange={onChange}
        aria-label={t('language.label')}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Component tests for `<LanguageSwitcher />`.
 *
 * Verifies that selecting a locale updates i18next's active
 * language and that the dropdown reflects the starting locale of
 * the injected i18n instance. happy-dom carries the cookie jar
 * i18next writes into, so we also assert that a post-change read
 * from `document.cookie` carries the new locale.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LanguageSwitcher } from '../src/components/LanguageSwitcher.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

function clearCookies(): void {
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      // eslint-disable-next-line unicorn/no-document-cookie -- test needs direct cookie jar access to simulate cleared state
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
}

describe('<LanguageSwitcher />', () => {
  let i18n: I18nInstance;

  beforeEach(async () => {
    clearCookies();
    globalThis.localStorage?.clear();
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  afterEach(() => {
    cleanup();
    clearCookies();
  });

  it('renders both supported locales as options', () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    const select = screen.getByTestId('language-switcher') as HTMLSelectElement;
    const values = [...select.querySelectorAll('option')].map((option) => option.value);
    expect(values).toEqual(['en', 'de']);
  });

  it('reflects the current locale as the selected value', () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    const select = screen.getByTestId('language-switcher') as HTMLSelectElement;
    expect(select.value).toBe('en');
  });

  it('changes i18next.language when a new locale is chosen', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    const select = screen.getByTestId('language-switcher') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'de' } });
    // Await i18next's internal language change (microtask).
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(i18n.language).toBe('de');
  });

  it('persists the selected locale into the cad_locale cookie', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    const select = screen.getByTestId('language-switcher') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'de' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.cookie).toContain('cad_locale=de');
  });

  it('ignores unsupported locale values silently', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    const select = screen.getByTestId('language-switcher') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'xx' } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(i18n.language).toBe('en');
  });

  it('uses the translated language label for the aria-label', () => {
    render(
      <I18nProvider i18n={i18n}>
        <LanguageSwitcher i18n={i18n} />
      </I18nProvider>,
    );
    expect(screen.getByLabelText('Language')).toBeDefined();
  });
});

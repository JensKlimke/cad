/**
 * Component tests for the `@cad/i18n` React wrapper.
 *
 * Runs under happy-dom via the vitest preset. Proves that an
 * `<I18nProvider>` + `useT(namespace)` round-trip renders the
 * expected translated string for every namespace that ships in
 * Slice 0b, in both locales.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { createBrowserI18n } from '../src/instance.js';
import { I18nProvider, useT } from '../src/react.js';

afterEach(() => {
  cleanup();
  for (const entry of document.cookie.split(';')) {
    const name = entry.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
  }
});

function ViewportLabel(): React.JSX.Element {
  const { t } = useT('viewport');
  return <span data-testid="label">{t('kernel.booting')}</span>;
}

function AuthError(): React.JSX.Element {
  const { t } = useT('errors');
  return <span data-testid="auth-error">{t('auth.invalid_credentials')}</span>;
}

function CommonCancel(): React.JSX.Element {
  const { t } = useT('common');
  return <span data-testid="cancel">{t('actions.cancel')}</span>;
}

describe('<I18nProvider> + useT()', () => {
  it('renders viewport strings in English', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'en' });
    render(
      <I18nProvider i18n={i18n}>
        <ViewportLabel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('label').textContent).toBe('Booting kernel…');
  });

  it('renders viewport strings in German', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={i18n}>
        <ViewportLabel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('label').textContent).toBe('Kernel wird geladen…');
  });

  it('renders errors namespace in English', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'en' });
    render(
      <I18nProvider i18n={i18n}>
        <AuthError />
      </I18nProvider>,
    );
    expect(screen.getByTestId('auth-error').textContent).toBe('Email or password is incorrect.');
  });

  it('renders errors namespace in German', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={i18n}>
        <AuthError />
      </I18nProvider>,
    );
    expect(screen.getByTestId('auth-error').textContent).toBe('E-Mail oder Passwort ist falsch.');
  });

  it('renders common namespace in German', async () => {
    const i18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={i18n}>
        <CommonCancel />
      </I18nProvider>,
    );
    expect(screen.getByTestId('cancel').textContent).toBe('Abbrechen');
  });

  it('isolates two providers with different locales in the same render tree', async () => {
    const en = await createBrowserI18n({ initialLocale: 'en' });
    const de = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <div>
        <I18nProvider i18n={en}>
          <div data-testid="en">
            <ViewportLabel />
          </div>
        </I18nProvider>
        <I18nProvider i18n={de}>
          <div data-testid="de">
            <ViewportLabel />
          </div>
        </I18nProvider>
      </div>,
    );
    expect(screen.getByTestId('en').textContent).toBe('Booting kernel…');
    expect(screen.getByTestId('de').textContent).toBe('Kernel wird geladen…');
  });
});

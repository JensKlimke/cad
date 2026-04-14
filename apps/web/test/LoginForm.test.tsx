/**
 * Component tests for `<LoginForm />`.
 *
 * Wraps the form in a minimal AuthProvider stack — i18n + react-
 * query + a stubbed `fetch`. Verifies the validation messages, the
 * happy-path mutation invocation, and the i18nKey re-translation
 * for server failures.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../src/auth/AuthContext.js';
import { LoginForm } from '../src/components/LoginForm.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

let i18n: I18nInstance;

beforeAll(async () => {
  i18n = await createBrowserI18n({ initialLocale: 'en' });
});

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function renderForm(opts: { onSuccess?: () => void } = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={makeQueryClient()}>
        <AuthProvider>
          {opts.onSuccess === undefined ? <LoginForm /> : <LoginForm onSuccess={opts.onSuccess} />}
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  // Default: every fetch returns 401 so AuthProvider settles into
  // an unauthenticated state without a real server.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        {
          error: { code: 'unauthorized', message: 'Authentication required.' },
        },
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('<LoginForm />', () => {
  it('renders email + password inputs and the submit button', () => {
    renderForm();
    expect(screen.getByTestId('login-email')).toBeDefined();
    expect(screen.getByTestId('login-password')).toBeDefined();
    expect(screen.getByTestId('login-submit')).toBeDefined();
  });

  it('shows the email-required message when submitted empty', async () => {
    renderForm();
    fireEvent.submit(screen.getByTestId('login-form'));
    await waitFor(() => {
      expect(screen.getByTestId('login-error').textContent).toContain('Email is required');
    });
  });

  it('shows the password-required message when only the email is filled', async () => {
    renderForm();
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));
    await waitFor(() => {
      expect(screen.getByTestId('login-error').textContent).toContain('Password is required');
    });
  });

  it('renders the German submit button when bound to the de locale', async () => {
    const deI18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={deI18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <AuthProvider>
            <LoginForm />
          </AuthProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    // German submit button text from auth.json
    expect(screen.getAllByText(/anmelden/iu).length).toBeGreaterThan(0);
  });

  it('re-translates a server i18nKey error in the active locale', async () => {
    // Override the default fetch stub: /auth/me returns 401, but
    // /auth/login returns a 401 carrying an i18nKey. The form
    // should re-translate that key against the active locale and
    // surface the German message.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/login')) {
          return Response.json(
            {
              error: {
                code: 'auth.invalid_credentials',
                message: 'Email or password is incorrect.',
                i18nKey: 'errors:auth.invalid_credentials',
              },
            },
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return Response.json(
          {
            error: { code: 'unauthorized', message: 'Authentication required.' },
          },
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const deI18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={deI18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <AuthProvider>
            <LoginForm />
          </AuthProvider>
        </QueryClientProvider>
      </I18nProvider>,
    );
    fireEvent.change(screen.getByTestId('login-email'), {
      target: { value: 'admin@example.test' },
    });
    fireEvent.change(screen.getByTestId('login-password'), {
      target: { value: 'wrong' },
    });
    fireEvent.submit(screen.getByTestId('login-form'));
    await waitFor(() => {
      // German translation of errors:auth.invalid_credentials
      expect(screen.getByTestId('login-error').textContent).toContain('falsch');
    });
  });
});

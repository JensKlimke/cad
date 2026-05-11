import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

vi.mock('../src/auth/AuthContext.js', () => ({
  AuthProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    me: {
      userId: '01HQ8K3VBRZ8XGRGY5T0WJD8AJ',
      email: 'admin@example.test',
      role: 'admin',
      workspaceId: '01HQ8K3VBRZ8XGRGY5T0WJD8AK',
      createdAt: '2026-04-18T11:00:00.000Z',
    },
    isLoading: false,
    login: async () => {},
    logout: async () => {},
  }),
}));

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method !== undefined) {
    return init.method;
  }
  if (typeof input === 'string' || input instanceof URL) {
    return 'GET';
  }
  return input.method || 'GET';
}

describe('<ProjectDetailRoute />', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = requestMethod(input, init);

        if (url.endsWith('/auth/me')) {
          throw new Error(
            'ProjectDetailRoute.test.tsx should not call /auth/me when AuthContext is mocked.',
          );
        }

        if (url.endsWith('/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH') && method === 'GET') {
          return Response.json({
            id: '01HQ8K3VBRZ8XGRGY5T0WJD8AH',
            workspaceId: '01HQ8K3VBRZ8XGRGY5T0WJD8AK',
            name: 'Gear Housing',
            createdBy: '01HQ8K3VBRZ8XGRGY5T0WJD8AJ',
            createdAt: '2026-04-18T11:00:00.000Z',
            updatedAt: '2026-04-18T11:00:00.000Z',
          });
        }

        if (url.includes('/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH/documents') && method === 'GET') {
          return Response.json({
            items: [],
          });
        }

        if (url.endsWith('/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH') && method === 'DELETE') {
          return new Response(null, { status: 204 });
        }

        if (url.includes('/projects?') || url.endsWith('/projects')) {
          return Response.json({
            items: [],
          });
        }

        throw new Error(`Unhandled fetch in ProjectDetailRoute.test.tsx: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('navigates back to the project list after deleting the project', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-detail')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('project-detail-delete'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-delete-dialog')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('confirm-delete-dialog-input'), {
      target: { value: 'Gear Housing' },
    });
    fireEvent.click(screen.getByTestId('confirm-delete-dialog-submit'));

    await waitFor(() => {
      expect(globalThis.location.pathname).toBe('/projects');
    });
    await waitFor(() => {
      expect(screen.getByTestId('project-list')).toBeDefined();
    });
  }, 10_000);
});

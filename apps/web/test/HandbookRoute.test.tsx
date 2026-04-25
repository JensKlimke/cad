import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/api/handbook.js', () => ({
  useHandbookPage: () => ({
    data: {
      kind: 'features',
      slug: 'pad',
      path: '/handbook/features/pad',
      title: 'Pad',
      summary: 'Build a rectangular solid from width, depth, and height inputs.',
      tags: ['sdk', 'feature', 'solid'],
      sdkOpId: 'pad',
      requestedLocale: 'en',
      sourceLocale: 'en',
      isFallback: false,
      body: '# Pad',
      html: '<h1 id="pad">Pad</h1><p>Build a rectangular solid.</p>',
      headings: [{ depth: 1, slug: 'pad', title: 'Pad' }],
    },
    isPending: false,
    isError: false,
  }),
}));

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

describe('<HandbookRoute />', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    globalThis.history.replaceState(null, '', '/handbook/features/pad');
  });

  it('renders the handbook page inside the workspace shell', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    expect(screen.getByTestId('handbook-route')).toBeDefined();
    expect(screen.getAllByRole('heading', { name: 'Pad' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Build a rectangular solid.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Pad' })).toBeDefined();
  }, 10_000);
});

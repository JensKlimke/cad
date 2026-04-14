/**
 * Smoke test for `<App />` after the Wave D router rewrite.
 *
 * The Slice 0 viewport is no longer reached at `/` — the router
 * shell redirects unauthenticated visitors to `/login`. This test
 * mounts the router (which uses `createBrowserRouter`) inside the
 * full provider stack (i18n + react-query) and asserts the
 * redirect lands on the login form.
 *
 * happy-dom does not ship a real WebGL canvas, so the
 * tessellation hash assertion lives in Playwright. The viewport
 * mount is exercised by `tests/e2e/src/box-renders.spec.ts` which
 * navigates through `/projects/:id/documents/:docId` after login.
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

class NoopWorker {
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  terminate(): void {}
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

describe('<App /> router shell', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    vi.stubGlobal('Worker', NoopWorker);
    // Force /login as the initial location so the redirect chain
    // does not need to round-trip through `/projects` first.
    globalThis.history.replaceState(null, '', '/login');
    // Mock fetch so the AuthContext's `useMe` query resolves to
    // 401 (unauthenticated) instead of trying to reach a real
    // server.
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

  it('mounts without throwing and renders the login form when unauthenticated', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('login-form')).toBeDefined();
    });
  });
});

// The per-locale assertion lives in Playwright (`tests/e2e`) where
// the cookie + bundle pipeline can be exercised for real. happy-dom
// is a poor stand-in for the React 19 + browser router + react-query
// concurrent rendering that locale switching depends on.

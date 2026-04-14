import { I18nProvider } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { i18nInstancePromise } from './i18n.js';

import './index.css';

const rootElement = document.querySelector('#root');
if (!(rootElement instanceof HTMLElement)) {
  throw new TypeError('@cad/web: #root element not found in index.html');
}

// Top-level await so the first React render sees a fully-initialised
// i18next instance — no flash of English before detection resolves.
const i18n = await i18nInstancePromise;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);

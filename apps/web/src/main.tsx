import { I18nProvider } from '@cad/i18n';
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

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
);

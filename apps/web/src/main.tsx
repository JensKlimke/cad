import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

import './index.css';

const rootElement = document.querySelector('#root');
if (!(rootElement instanceof HTMLElement)) {
  throw new TypeError('@cad/web: #root element not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

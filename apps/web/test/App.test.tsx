/**
 * Smoke test for `<App />`.
 *
 * happy-dom cannot render a real WebGL canvas, so we cannot assert the
 * box is actually visible. What this test verifies is that the React
 * tree mounts without throwing — catches missing imports, null-ref bugs,
 * and SSR-unsafe patterns. The `data-tessellation-hash` attribute
 * starts empty and is populated later once the real kernel runs; that
 * full-pixel assertion lives in Playwright (W12).
 *
 * To prevent the component from trying to `new Worker(new URL(...))`
 * (which fails under happy-dom), we stub `globalThis.Worker` with a
 * no-op implementation before rendering. The test also wraps the tree
 * in `<I18nProvider>` so `useT('viewport')` inside Viewport can
 * resolve catalog keys without a live browser i18n instance — the
 * Slice 0b contract (every user-visible string routes through
 * `@cad/i18n`).
 */

import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

class NoopWorker {
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  terminate(): void {}
}

describe('<App />', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    vi.stubGlobal('Worker', NoopWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mounts without throwing and exposes the data-tessellation-hash attribute', () => {
    render(
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>,
    );
    const root = screen.getByText(/booting kernel/iu).parentElement;
    expect(root).not.toBeNull();
    expect(root?.hasAttribute('data-tessellation-hash')).toBe(true);
  });

  it('renders the German overlay when initialLocale is de', async () => {
    const deI18n = await createBrowserI18n({ initialLocale: 'de' });
    render(
      <I18nProvider i18n={deI18n}>
        <App />
      </I18nProvider>,
    );
    expect(screen.getByText(/kernel wird geladen/iu)).toBeDefined();
  });
});

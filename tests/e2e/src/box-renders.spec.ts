/**
 * Slice 1 Wave D transition spec — login redirect + locale parity.
 *
 * **This spec replaces the Slice 0 box-renders journey temporarily.**
 * Wave D introduces the React Router shell: visiting `/` now
 * redirects to `/login` because there is no authenticated session
 * yet. The full kernel → worker → three.js golden journey moves to
 * `lifecycle.spec.ts` in Wave E (W15), where the API server lands
 * and Playwright can drive a real login → create-project →
 * create-document → viewport flow.
 *
 * Until Wave E, this spec verifies:
 *
 *   1. The router shell mounts under both supported locales
 *   2. The login form renders with the locale-correct title
 *      (`Sign in` / `Anmelden`)
 *   3. The cookie-based locale detection round-trip works in a
 *      real Chromium
 *
 * Slice 0's tessellation hash assertion lives in
 * `packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap`
 * — the kernel itself is still snapshot-tested at the unit layer.
 * The browser-side determinism guarantee comes back online in Wave E.
 */

import { expect, test } from '@playwright/test';

interface LocaleCase {
  readonly locale: 'en' | 'de';
  readonly loginTitle: string;
}

const LOCALE_CASES: readonly LocaleCase[] = [
  { locale: 'en', loginTitle: 'Sign in' },
  { locale: 'de', loginTitle: 'Anmelden' },
];

for (const { locale, loginTitle } of LOCALE_CASES) {
  test.describe(`router shell + login redirect (${locale})`, () => {
    test(`redirects unauthenticated visitors to /login and renders the ${locale} login title`, async ({
      page,
      context,
    }) => {
      await context.addCookies([
        {
          name: 'cad_locale',
          value: locale,
          domain: '127.0.0.1',
          path: '/',
          sameSite: 'Lax',
        },
      ]);

      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          // Pre-Wave-E: the AuthContext fires `/api/auth/me` on
          // mount, but no server is running yet. The 404 console
          // error is expected — Wave E lands the API server and
          // this filter goes away with the spec rewrite.
          if (text.includes('Failed to load resource') && text.includes('404')) {
            return;
          }
          consoleErrors.push(text);
        }
      });
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      await page.goto('/');

      // The router shell redirects `/` → `/projects` → `/login`
      // because there is no authenticated session.
      await expect(page).toHaveURL(/\/login/u);

      // Login form mounts with the locale-correct title.
      await expect(page.getByTestId('login-form')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('heading', { name: loginTitle })).toBeVisible();

      // The web app should be silent at runtime — any console or
      // page error is a regression we want to catch.
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

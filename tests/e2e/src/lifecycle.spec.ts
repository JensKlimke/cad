import { expect, test } from '@playwright/test';

interface LocaleCase {
  readonly locale: 'en' | 'de';
  readonly loginTitle: string;
}

const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@example.test';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'change-me-admin-password';
const EXPECTED_HASH = 'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0';

const LOCALE_CASES: readonly LocaleCase[] = [
  { locale: 'en', loginTitle: 'Sign in' },
  { locale: 'de', loginTitle: 'Anmelden' },
];

for (const { locale, loginTitle } of LOCALE_CASES) {
  test.describe(`compose lifecycle (${locale})`, () => {
    test(`logs in, creates a project, opens a document, and renders the viewport`, async ({
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
          if (text.includes('Failed to load resource') && text.includes('401')) {
            return;
          }
          consoleErrors.push(text);
        }
      });
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => {
        pageErrors.push(error.message);
      });

      const projectName = `E2E ${locale} ${Date.now()}`;

      await page.goto('/');
      await expect(page).toHaveURL(/\/login/u);
      await expect(page.getByRole('heading', { name: loginTitle })).toBeVisible();

      await page.getByTestId('login-email').fill(ADMIN_EMAIL);
      await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
      await page.getByTestId('login-submit').click();

      await expect(page).toHaveURL(/\/projects$/u);
      await expect(page.getByTestId('project-list')).toBeVisible();

      await page.getByTestId('project-list-create').click();
      await expect(page.getByTestId('new-project-dialog')).toBeVisible();
      await page.getByTestId('new-project-dialog-name').fill(projectName);
      await page.getByTestId('new-project-dialog-submit').click();

      await expect(page.getByText(projectName)).toBeVisible();
      await page.locator('[data-testid^="project-card-open-"]').first().click();

      await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
      await expect(page.getByTestId('project-detail')).toBeVisible();

      await page.getByTestId('project-detail-new-document').click();

      await expect(page).toHaveURL(/\/projects\/[^/]+\/documents\/[^/]+$/u);
      const viewport = page.locator('[data-tessellation-hash]');
      await expect(viewport).toHaveAttribute('data-tessellation-hash', EXPECTED_HASH);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

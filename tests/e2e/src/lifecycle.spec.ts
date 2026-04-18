import { expect, test } from '@playwright/test';

import type { BrowserContext, Locator, Page } from '@playwright/test';

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

const UPDATED_DOCUMENT_SOURCE = `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 16, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    pad({
      id: 'pad_1',
      width: reference('width'),
      depth: reference('depth'),
      height: reference('height'),
    }),
  ]),
});
`;

const INVALID_DOCUMENT_SOURCE = `import fs from 'node:fs';

export default {};
`;

async function attachErrorCollectors(
  page: Page,
  ignoredConsoleErrors: readonly string[] = [],
): Promise<{
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
}> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (text.includes('Failed to load resource') && text.includes('401')) {
        return;
      }
      if (ignoredConsoleErrors.some((fragment) => text.includes(fragment))) {
        return;
      }
      consoleErrors.push(text);
    }
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
}

async function login(
  page: Page,
  context: BrowserContext,
  locale: 'en' | 'de',
  loginTitle: string,
): Promise<void> {
  await context.addCookies([
    {
      name: 'cad_locale',
      value: locale,
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/u);
  await expect(page.getByRole('heading', { name: loginTitle })).toBeVisible();

  await page.getByTestId('login-email').fill(ADMIN_EMAIL);
  await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByTestId('project-list')).toBeVisible();
}

async function createProjectAndOpen(page: Page, name: string): Promise<void> {
  await page.getByTestId('project-list-create').click();
  await expect(page.getByTestId('new-project-dialog')).toBeVisible();
  await page.getByTestId('new-project-dialog-name').fill(name);
  await page.getByTestId('new-project-dialog-submit').click();

  await expect(page.getByText(name)).toBeVisible();
  await page.locator('[data-testid^="project-card-open-"]').first().click();

  await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  await expect(page.getByTestId('project-detail')).toBeVisible();
}

async function createDocumentAndWaitForViewport(page: Page): Promise<Locator> {
  await page.getByTestId('project-detail-new-document').click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents\/[^/]+$/u);
  await expect(page.getByTestId('document-source-editor')).toBeVisible();
  const viewport = page.locator('[data-tessellation-hash]');
  const initialViewportReady = await viewport
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!initialViewportReady) {
    await page.getByTestId('document-build').click();
  }
  await expect(viewport).toHaveAttribute('data-tessellation-hash', EXPECTED_HASH);
  return viewport;
}

async function replaceDocumentSource(page: Page, source: string): Promise<void> {
  const editor = page.getByTestId('document-source-editor-input');
  await expect(editor).toBeVisible();
  await editor.fill(source);
}

for (const { locale, loginTitle } of LOCALE_CASES) {
  test.describe(`compose lifecycle (${locale})`, () => {
    test(`logs in, creates a project, opens a document, and renders the viewport`, async ({
      page,
      context,
    }) => {
      const { consoleErrors, pageErrors } = await attachErrorCollectors(page);

      const projectName = `E2E ${locale} ${Date.now()}`;

      await login(page, context, locale, loginTitle);
      await createProjectAndOpen(page, projectName);
      await createDocumentAndWaitForViewport(page);

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

test.describe('document workspace', () => {
  test('edits source, saves, rebuilds, and updates the viewport hash', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E edit ${Date.now()}`);
    const viewport = await createDocumentAndWaitForViewport(page);

    await replaceDocumentSource(page, UPDATED_DOCUMENT_SOURCE);
    await page.getByTestId('document-build').click();

    await expect.poll(async () => page.getByTestId('document-build').textContent()).toBe('Build');
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .not.toBe(EXPECTED_HASH);
    await expect(page.getByTestId('document-build-status')).toContainText('Build ready. Tessellation hash');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('shows structured diagnostics when a build fails', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page, [
      'Failed to load resource: the server responded with a status of 422',
    ]);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E invalid ${Date.now()}`);
    await createDocumentAndWaitForViewport(page);

    await replaceDocumentSource(page, INVALID_DOCUMENT_SOURCE);
    await page.getByTestId('document-build').click();

    await expect(page.getByTestId('document-diagnostics')).toBeVisible();
    await expect(page.getByTestId('document-diagnostics')).toContainText('runtime.unsupported_import');
    await expect(page.getByTestId('document-diagnostics')).toContainText(
      'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
    );

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe('project management', () => {
  test('renames and deletes a project from the detail page', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page, [
      'Failed to load resource: the server responded with a status of 404',
    ]);
    const projectName = `E2E project ${Date.now()}`;
    const renamedProjectName = `${projectName} renamed`;

    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, projectName);

    await page.getByTestId('project-detail-rename').click();
    await expect(page.getByTestId('rename-project-dialog')).toBeVisible();
    await page.getByTestId('rename-project-dialog-name').fill(renamedProjectName);
    await page.getByTestId('rename-project-dialog-submit').click();
    await expect(page.getByTestId('project-detail')).toContainText(renamedProjectName);

    await page.getByTestId('project-detail-delete').click();
    await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible();
    const confirmationName =
      (await page.getByTestId('confirm-delete-dialog-input').getAttribute('placeholder')) ?? '';
    await page.getByTestId('confirm-delete-dialog-input').fill(confirmationName);
    await page.getByTestId('confirm-delete-dialog-submit').click();

    await expect(page).toHaveURL(/\/projects$/u);
    await expect(page.getByTestId('project-list')).toBeVisible();
    await expect(page.getByText(renamedProjectName)).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

import { expect, test } from '@playwright/test';

import type { BrowserContext, Locator, Page } from '@playwright/test';

interface LocaleCase {
  readonly locale: 'en' | 'de';
  readonly loginTitle: string;
}

const ADMIN_EMAIL = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@example.test';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'change-me-admin-password';
const EXPECTED_HASH = '40055f79baa3b42770a87a08936c9066b574e0e5fd755e9fa14af5c00fce45b2';

const LOCALE_CASES: readonly LocaleCase[] = [
  { locale: 'en', loginTitle: 'Sign in' },
  { locale: 'de', loginTitle: 'Anmelden' },
];

const UPDATED_DOCUMENT_SOURCE = `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 16, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="16" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
});
`;

const INVALID_DOCUMENT_SOURCE = `import fs from 'node:fs';

export default {};
`;

const REMOTE_FAILURE_SOURCE = `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="10" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
      constraints: {
        kind: 'rectangle',
        anchor: 'origin',
        width: { kind: 'reference', name: 'width' },
        height: { kind: 'reference', name: 'depth' },
      },
    }),
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('missingHeight'), direction: 'up' }),
  ]),
});
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
    if (error.message === 'Canceled') {
      return;
    }
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
  if (page.url().endsWith('/projects')) {
    await expect(page.getByTestId('project-list')).toBeVisible();
    return;
  }

  async function attemptLogin(): Promise<boolean> {
    await expect(page).toHaveURL(/\/login/u);
    await expect(page.getByRole('heading', { name: loginTitle })).toBeVisible();

    await page.getByTestId('login-email').fill(ADMIN_EMAIL);
    await page.getByTestId('login-password').fill(ADMIN_PASSWORD);
    await page.getByTestId('login-submit').click();
    return page.waitForURL(/\/projects$/u, { timeout: 15_000 }).then(() => true).catch(() => false);
  }

  const firstAttempt = await attemptLogin();
  if (!firstAttempt) {
    await page.goto('/login?next=%2Fprojects');
    expect(await attemptLogin()).toBe(true);
  }

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
  const editor = page.getByTestId('document-source-editor');
  await expect(editor).toBeVisible();
  await editor.evaluate((node, nextSource) => {
    const setSource = (node as { __cadSetSource?: (source: string) => void }).__cadSetSource;
    if (typeof setSource !== 'function') {
      throw new TypeError('document editor test hook is not available');
    }
    setSource(nextSource);
  }, source);
}

async function readDocumentSource(page: Page): Promise<string> {
  const editor = page.getByTestId('document-source-editor');
  await expect(editor).toBeVisible();
  return editor.evaluate((node) => {
    const getSource = (node as { __cadGetSource?: () => string }).__cadGetSource;
    if (typeof getSource !== 'function') {
      throw new TypeError('document editor source hook is not available');
    }
    return getSource();
  });
}

function currentDocumentId(page: Page): string {
  const match = /\/documents\/([^/]+)$/u.exec(page.url());
  if (match === null) {
    throw new TypeError(`Could not resolve document id from URL: ${page.url()}`);
  }
  const documentId = match[1];
  if (documentId === undefined) {
    throw new TypeError(`Could not resolve document id from URL: ${page.url()}`);
  }
  return documentId;
}

function currentProjectId(page: Page): string {
  const match = /\/projects\/([^/]+)(?:\/documents\/[^/]+)?$/u.exec(page.url());
  if (match === null) {
    throw new TypeError(`Could not resolve project id from URL: ${page.url()}`);
  }
  const projectId = match[1];
  if (projectId === undefined) {
    throw new TypeError(`Could not resolve project id from URL: ${page.url()}`);
  }
  return projectId;
}

async function triggerRemoteBuild(page: Page): Promise<{ readonly ok: boolean; readonly status: number }> {
  const documentId = currentDocumentId(page);
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/documents/${id}/build`, {
      method: 'POST',
      credentials: 'include',
    });
    await response.text();
    return { ok: response.ok, status: response.status };
  }, documentId);
}

async function readViewportPersistence(
  page: Page,
  documentId: string,
): Promise<{
  readonly projection: string | null;
  readonly namedView: string | null;
  readonly visualStyle: string | null;
  readonly selectionFilter: string | null;
}> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(`cad:viewport:${id}`);
    if (raw === null) {
      return {
        projection: null,
        namedView: null,
        visualStyle: null,
        selectionFilter: null,
      };
    }
    const parsed = JSON.parse(raw) as {
      readonly projection?: string;
      readonly namedView?: string;
      readonly visualStyle?: string;
      readonly selectionFilter?: string;
    };
    return {
      projection: parsed.projection ?? null,
      namedView: parsed.namedView ?? null,
      visualStyle: parsed.visualStyle ?? null,
      selectionFilter: parsed.selectionFilter ?? null,
    };
  }, documentId);
}

async function waitForBuildIdle(page: Page): Promise<void> {
  await expect.poll(async () => page.getByTestId('document-build').textContent()).toBe('Build');
}

async function selectInspectorParameter(page: Page, parameterId: string): Promise<void> {
  await page.getByTestId(`authoring-parameter-${parameterId}`).click();
  await expect(page.getByTestId('document-inspector-parameter')).toBeVisible();
}

async function selectInspectorFeature(page: Page, featureId: string): Promise<void> {
  await page.getByTestId(`authoring-feature-${featureId}`).click();
  await expect(page.getByTestId('document-inspector-feature')).toBeVisible();
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

    await waitForBuildIdle(page);
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .not.toBe(EXPECTED_HASH);
    await expect(page.getByTestId('document-build-status')).toContainText('Build ready. Tessellation hash');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('supports inspector edits plus undo and redo for parameter-driven geometry', async ({
    page,
    context,
  }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E parameter ${Date.now()}`);
    const viewport = await createDocumentAndWaitForViewport(page);
    const originalHash = await viewport.evaluate((node) => node.dataset.tessellationHash ?? null);

    await selectInspectorParameter(page, 'parameter_1');
    await expect(page.getByTestId('document-inspector-parameter')).toContainText('width');
    await page.getByTestId('document-inspector-parameter-value').fill('14');
    await page.getByTestId('document-inspector-save-parameter').click();

    await expect.poll(() => readDocumentSource(page)).toContain("width: { kind: 'number', value: 14, unit: 'mm' }");

    await page.getByTestId('document-undo').click();
    await expect.poll(() => readDocumentSource(page)).toContain("width: { kind: 'number', value: 10, unit: 'mm' }");

    await page.getByTestId('document-redo').click();
    await expect.poll(() => readDocumentSource(page)).toContain("width: { kind: 'number', value: 14, unit: 'mm' }");

    await page.getByTestId('document-build').click();
    await waitForBuildIdle(page);
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .not.toBe(originalHash);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('supports sketch mode dimension edits and rebuild of the active document', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E sketch ${Date.now()}`);
    const viewport = await createDocumentAndWaitForViewport(page);
    const originalHash = await viewport.evaluate((node) => node.dataset.tessellationHash ?? null);

    await selectInspectorFeature(page, 'sketch_1');
    await page.getByTestId('document-inspector-edit-sketch').click();
    await expect(page.getByTestId('sketch-mode')).toBeVisible();

    await page.getByTestId('sketch-width-binding').selectOption('literal');
    await expect(page.getByTestId('sketch-width-literal')).toHaveValue('10');
    await page.getByTestId('sketch-width-literal').fill('26');
    await expect(page.getByTestId('sketch-width-literal')).toHaveValue('26');
    await expect(page.getByTestId('sketch-preview-size')).toContainText('26 × 20 mm');
    await page.getByTestId('sketch-apply-bindings').click();
    await expect.poll(() => readDocumentSource(page)).toContain("width: { kind: 'literal', value: 26, unit: 'mm' }");
    await page.getByTestId('sketch-exit').click();

    await page.getByTestId('document-build').click();
    await waitForBuildIdle(page);
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .not.toBe(originalHash);

    expect(await readDocumentSource(page)).toContain("sketch({");
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

  test('exports the current document as STL', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E export ${Date.now()}`);
    await createDocumentAndWaitForViewport(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('document-export-stl').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.stl$/u);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('reflects remote build failures and later remote build recovery in the open document page', async ({
    page,
    context,
  }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page, [
      'Failed to load resource: the server responded with a status of 422',
    ]);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E remote ${Date.now()}`);
    const viewport = await createDocumentAndWaitForViewport(page);
    const originalHash = await viewport.evaluate((node) => node.dataset.tessellationHash ?? null);

    await replaceDocumentSource(page, REMOTE_FAILURE_SOURCE);
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-save-status')).toContainText('Saved');

    const failedBuild = await triggerRemoteBuild(page);
    expect(failedBuild.ok).toBe(false);
    expect(failedBuild.status).toBe(422);

    await expect(page.getByTestId('document-build-status')).toContainText('Build failed');
    await expect(page.getByTestId('document-diagnostics')).toContainText('runtime.unknown_parameter');
    await expect(page.getByTestId('document-viewport-summary')).toContainText('latest streamed build failed');
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .toBe(originalHash);
    await expect(page.getByTestId('document-build')).toHaveText('Build');

    await replaceDocumentSource(page, UPDATED_DOCUMENT_SOURCE);
    await page.getByTestId('document-save').click();
    await expect(page.getByTestId('document-save-status')).toContainText('Saved');

    const readyBuild = await triggerRemoteBuild(page);
    expect(readyBuild.ok).toBe(true);
    expect(readyBuild.status).toBe(200);

    await expect(page.getByTestId('document-build-status')).toContainText('Build ready');
    await expect
      .poll(async () => viewport.evaluate((node) => node.dataset.tessellationHash ?? null))
      .not.toBe(originalHash);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('persists viewport settings per document instead of leaking them across documents', async ({
    page,
    context,
  }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);
    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E viewport ${Date.now()}`);
    await createDocumentAndWaitForViewport(page);

    const projectId = currentProjectId(page);
    const firstDocumentId = currentDocumentId(page);
    const viewportRoot = page.getByTestId('viewport-root');
    const viewportStatusbar = page.getByTestId('viewport-statusbar');

    await page.getByRole('button', { name: 'Orthographic' }).click();
    await page.getByLabel('Style').selectOption('wireframe');
    await page.getByLabel('Selection').selectOption('edge');
    await page.getByRole('button', { name: 'Right' }).click();

    await expect(viewportRoot).toHaveAttribute('data-camera-mode', 'orthographic');
    await expect(viewportRoot).toHaveAttribute('data-named-view', 'right');
    await expect(viewportRoot).toHaveAttribute('data-visual-style', 'wireframe');
    await expect(viewportRoot).toHaveAttribute('data-selection-filter', 'edge');
    await expect(viewportStatusbar).toContainText('Right');

    await expect.poll(() => readViewportPersistence(page, firstDocumentId)).toEqual({
      projection: 'orthographic',
      namedView: 'right',
      visualStyle: 'wireframe',
      selectionFilter: 'edge',
    });

    await page.reload();
    await expect(page.getByTestId('document-source-editor')).toBeVisible();
    await expect(viewportRoot).toHaveAttribute('data-camera-mode', 'orthographic');
    await expect(viewportRoot).toHaveAttribute('data-named-view', 'right');
    await expect(viewportRoot).toHaveAttribute('data-visual-style', 'wireframe');
    await expect(viewportRoot).toHaveAttribute('data-selection-filter', 'edge');

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('project-detail')).toBeVisible();
    await page.getByTestId('project-detail-new-document').click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/documents\/[^/]+$/u);
    await expect(page.getByTestId('document-source-editor')).toBeVisible();
    const secondViewport = page.locator('[data-tessellation-hash]');
    const secondViewportReady = await secondViewport
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!secondViewportReady) {
      await page.getByTestId('document-build').click();
      await expect(secondViewport).toHaveAttribute('data-tessellation-hash', EXPECTED_HASH);
    }

    const secondDocumentId = currentDocumentId(page);
    expect(secondDocumentId).not.toBe(firstDocumentId);
    await expect(viewportRoot).toHaveAttribute('data-camera-mode', 'perspective');
    await expect(viewportRoot).toHaveAttribute('data-named-view', 'iso');
    await expect(viewportRoot).toHaveAttribute('data-visual-style', 'shaded-edges');
    await expect(viewportRoot).toHaveAttribute('data-selection-filter', 'face');

    await page.goto(`/projects/${projectId}/documents/${firstDocumentId}`);
    await expect(page.getByTestId('document-source-editor')).toBeVisible();
    await expect(viewportRoot).toHaveAttribute('data-camera-mode', 'orthographic');
    await expect(viewportRoot).toHaveAttribute('data-named-view', 'right');
    await expect(viewportRoot).toHaveAttribute('data-visual-style', 'wireframe');
    await expect(viewportRoot).toHaveAttribute('data-selection-filter', 'edge');

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

test.describe('handbook access', () => {
  test('loads a handbook page inside the authenticated shell', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);

    await login(page, context, 'en', 'Sign in');
    await page.goto('/handbook/features/pad');

    await expect(page).toHaveURL(/\/handbook\/features\/pad$/u);
    await expect(page.getByTestId('handbook-route')).toBeVisible();
    await expect(page.getByTestId('handbook-content')).toContainText(
      'pad() is the first sketch-driven solid feature in the current product slice.',
    );
    await expect(page.getByTestId('handbook-content')).toContainText('Dual-write behavior');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('opens contextual help from the feature inspector', async ({ page, context }) => {
    const { consoleErrors, pageErrors } = await attachErrorCollectors(page);

    await login(page, context, 'en', 'Sign in');
    await createProjectAndOpen(page, `E2E help ${Date.now()}`);
    await createDocumentAndWaitForViewport(page);

    await page.getByTestId('authoring-feature-pad_1').click();
    await expect(page.getByTestId('document-inspector-feature')).toBeVisible();
    await page.getByTestId('feature-inspector-help').click();

    await expect(page).toHaveURL(/\/handbook\/features\/pad$/u);
    await expect(page.getByTestId('handbook-content')).toContainText('Dual-write behavior');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

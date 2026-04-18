import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForwardedRef, ReactNode } from 'react';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;
let failBuildRequest = false;

vi.mock('../src/viewport/Viewport.js', () => ({
  Viewport: ({ tessellation }: { readonly tessellation?: { readonly metadata: { readonly hash: string } } }) => (
    <div data-testid="mock-viewport">{tessellation?.metadata.hash ?? 'no-hash'}</div>
  ),
}));

vi.mock('../src/components/DocumentSourceEditor.js', () => ({
  DocumentSourceEditor: forwardRef(function MockDocumentSourceEditor(
    {
      value,
      onChange,
    }: {
      readonly value: string;
      readonly onChange: (value: string) => void;
    },
    ref: ForwardedRef<{ focusRange(start: number, end: number): void; focusStart(): void }>,
  ) {
    const inputReference = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(ref, () => ({
      focusRange(start, end) {
        inputReference.current?.focus();
        inputReference.current?.setSelectionRange(start, end);
      },
      focusStart() {
        inputReference.current?.focus();
        inputReference.current?.setSelectionRange(0, 0);
      },
    }), []);

    return (
      <textarea
        ref={inputReference}
        data-testid="document-source-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }),
}));

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

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method !== undefined) {
    return init.method;
  }
  if (typeof input === 'string' || input instanceof URL) {
    return 'GET';
  }
  return input.method || 'GET';
}

const BUILD_RESPONSE = {
  documentId: '01HQ8K3VBRZ8XGRGY5T0WJD8AF',
  artifactKey: 'builds/01HQ8K3VBRZ8XGRGY5T0WJD8AF/01HQ8K3VBRZ8XGRGY5T0WJD8AG.json',
  artifactUrl: 'https://minio.test/builds/01HQ8K3VBRZ8XGRGY5T0WJD8AF/01HQ8K3VBRZ8XGRGY5T0WJD8AG.json',
  artifactExpiresAt: '2026-04-18T12:00:00.000Z',
  build: {
    documentHash: 'a'.repeat(64),
    parameterOrder: ['width', 'depth', 'height'],
    parameters: {
      width: {
        name: 'width',
        value: 10,
        unit: 'mm',
        source: { kind: 'number', value: 10, unit: 'mm' },
      },
      depth: {
        name: 'depth',
        value: 20,
        unit: 'mm',
        source: { kind: 'number', value: 20, unit: 'mm' },
      },
      height: {
        name: 'height',
        value: 30,
        unit: 'mm',
        source: { kind: 'number', value: 30, unit: 'mm' },
      },
    },
    features: [{ id: 'pad_1', kind: 'pad', inputHash: 'b'.repeat(64), cached: false }],
    tessellation: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
      metadata: {
        hash: 'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
        triangleCount: 1,
        vertexCount: 3,
        bbox: { min: [0, 0, 0], max: [1, 1, 0] },
      },
    },
  },
} as const;

describe('<DocumentHostRoute />', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    vi.resetModules();
    failBuildRequest = false;
    globalThis.history.replaceState(
      null,
      '',
      '/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        const method = requestMethod(input, init);

        if (url.endsWith('/auth/me')) {
          throw new Error('DocumentHostRoute.test.tsx should not call /auth/me when AuthContext is mocked.');
        }

        if (url.endsWith('/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH')) {
          return Response.json({
            id: '01HQ8K3VBRZ8XGRGY5T0WJD8AH',
            workspaceId: '01HQ8K3VBRZ8XGRGY5T0WJD8AK',
            name: 'Gear Housing',
            createdBy: '01HQ8K3VBRZ8XGRGY5T0WJD8AJ',
            createdAt: '2026-04-18T11:00:00.000Z',
            updatedAt: '2026-04-18T11:00:00.000Z',
          });
        }

        if (url.endsWith('/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF') && method === 'GET') {
          return Response.json({
            id: '01HQ8K3VBRZ8XGRGY5T0WJD8AF',
            projectId: '01HQ8K3VBRZ8XGRGY5T0WJD8AH',
            name: 'Bracket',
            tsSource: `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 10, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') })]),
});
`,
            headVersionId: null,
            createdBy: '01HQ8K3VBRZ8XGRGY5T0WJD8AJ',
            createdAt: '2026-04-18T11:00:00.000Z',
            updatedAt: '2026-04-18T11:00:00.000Z',
          });
        }

        if (url.endsWith('/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF') && method === 'PATCH') {
          const bodyText = init?.body;
          const tsSource =
            typeof bodyText === 'string' ? (JSON.parse(bodyText) as { readonly tsSource: string }).tsSource : '';
          return Response.json({
            id: '01HQ8K3VBRZ8XGRGY5T0WJD8AF',
            projectId: '01HQ8K3VBRZ8XGRGY5T0WJD8AH',
            name: 'Bracket',
            tsSource,
            headVersionId: null,
            createdBy: '01HQ8K3VBRZ8XGRGY5T0WJD8AJ',
            createdAt: '2026-04-18T11:00:00.000Z',
            updatedAt: '2026-04-18T11:05:00.000Z',
          });
        }

        if (url.endsWith('/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF/build') && method === 'POST') {
          if (failBuildRequest) {
            return Response.json(
              {
                error: {
                  code: 'build.failed',
                  message: 'Build failed.',
                  details: {
                    diagnostics: [
                      {
                        code: 'runtime.unsupported_import',
                        message: 'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
                        range: { start: 8, end: 15 },
                        path: ['imports', '0'],
                      },
                    ],
                  },
                },
              },
              { status: 422 },
            );
          }
          return Response.json(BUILD_RESPONSE);
        }

        throw new Error(`Unhandled fetch in DocumentHostRoute.test.tsx: ${method} ${url}`);
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => false));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the persisted source editor and server-built viewport output', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Bracket' })).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByTestId('mock-viewport')).toBeDefined();
    });

    const editor = screen.getByTestId('document-source-editor') as HTMLTextAreaElement;
    expect(editor.value).toContain('defineDocument');
    expect(screen.getAllByText('Build ready. Tessellation hash c3a9076d584f')).toHaveLength(2);
    expect(screen.getByText('width')).toBeDefined();
    expect(screen.getByText('10 mm')).toBeDefined();
    expect(screen.getByTestId('document-save-status').textContent).toContain('Saved source is ready to build.');
    expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
  });

  it('shows draft feedback while editing and after saving', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('document-source-editor')).toBeDefined();
    });

    const editor = screen.getByTestId('document-source-editor');
    fireEvent.change(editor, {
      target: {
        value: `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 12, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') })]),
});
`,
      },
    });

    expect(screen.getByTestId('document-save-status').textContent).toContain(
      'Draft updated locally. Changes will autosave shortly.',
    );

    fireEvent.click(screen.getByTestId('document-save'));

    await waitFor(() => {
      expect(screen.getByTestId('document-save-status').textContent).toContain('All changes saved to the server.');
    });
  });

  it('blocks navigation away when the draft is dirty and the user cancels leaving', async () => {
    const confirmSpy = vi.mocked(globalThis.confirm);
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('document-source-editor')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('document-source-editor'), {
      target: {
        value: `import { body, defineDocument, pad, parameters, reference } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 14, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([pad({ id: 'pad_1', width: reference('width'), depth: reference('depth'), height: reference('height') })]),
});
`,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'You have unsaved document changes. Leave this page and discard the current draft?',
    );
    expect(globalThis.location.pathname).toBe('/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF');
    expect(screen.getByTestId('document-host')).toBeDefined();
  });

  it('focuses the failing source range and retries the build from diagnostics', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('document-source-editor')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('document-source-editor'), {
      target: { value: `import fs from 'node:fs';\n\nexport default {};\n` },
    });

    failBuildRequest = true;
    fireEvent.click(screen.getByTestId('document-build'));

    await waitFor(() => {
      expect(screen.getByTestId('document-diagnostics')).toBeDefined();
    });
    expect(screen.getByTestId('document-diagnostics').textContent).toContain('runtime.unsupported_import');

    const editor = screen.getByTestId('document-source-editor') as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId('document-diagnostic-0'));

    expect(editor.selectionStart).toBe(8);
    expect(editor.selectionEnd).toBe(15);
    expect(screen.getByTestId('document-diagnostics').textContent).toContain('Line 1, columns 9-16');

    failBuildRequest = false;
    fireEvent.click(screen.getByTestId('document-diagnostics-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });
  });
});

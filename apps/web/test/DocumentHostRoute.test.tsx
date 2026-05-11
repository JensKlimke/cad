import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForwardedRef, ReactNode } from 'react';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;
let failBuildRequest = false;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Set<EventListener>>();
  readonly url: string;
  readonly withCredentials: boolean;
  closed = false;

  constructor(url: string | URL, init?: EventSourceInit) {
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data: unknown): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

vi.mock('../src/viewport/Viewport.js', () => ({
  Viewport: ({
    tessellation,
  }: {
    readonly tessellation?: { readonly metadata: { readonly hash: string } };
  }) => <div data-testid="mock-viewport">{tessellation?.metadata.hash ?? 'no-hash'}</div>,
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
    useImperativeHandle(
      ref,
      () => ({
        focusRange(start, end) {
          inputReference.current?.focus();
          inputReference.current?.setSelectionRange(start, end);
        },
        focusStart() {
          inputReference.current?.focus();
          inputReference.current?.setSelectionRange(0, 0);
        },
      }),
      [],
    );

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
  artifactUrl:
    'https://minio.test/builds/01HQ8K3VBRZ8XGRGY5T0WJD8AF/01HQ8K3VBRZ8XGRGY5T0WJD8AG.json',
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
    features: [
      {
        id: 'sketch_1',
        kind: 'sketch',
        inputHash: 'a'.repeat(64),
        cached: false,
        sketch: {
          plane: 'xy',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="10" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
          geometry: { kind: 'rectangle', x: 0, y: 0, width: 10, height: 20 },
          constraints: {
            kind: 'rectangle',
            anchor: 'origin',
            width: { kind: 'reference', name: 'width' },
            height: { kind: 'reference', name: 'depth' },
          },
          dimensions: { width: 10, height: 20 },
          status: 'fully_constrained',
          diagnostics: [],
        },
      },
      {
        id: 'pad_1',
        kind: 'pad',
        inputHash: 'b'.repeat(64),
        cached: false,
        pad: { sketch: 'sketch_1', length: 30, direction: 'up' },
      },
    ],
    topology: {
      entities: [
        {
          id: 'pad_1.face.top',
          kind: 'face',
          featureId: 'pad_1',
          constructionPath: 'pad_1.face.top',
          label: 'Top face',
          centroid: [5, 10, 30],
          normal: [0, 0, 1],
          area: 200,
          zRange: [30, 30],
          hash: {
            value: 'd'.repeat(64),
            quantization: 1e-6,
          },
        },
      ],
    },
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
    FakeEventSource.instances = [];
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
          throw new Error(
            'DocumentHostRoute.test.tsx should not call /auth/me when AuthContext is mocked.',
          );
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
            tsSource: `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

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
    pad({ id: 'pad_1', sketch: feature('sketch_1'), length: reference('height'), direction: 'up' }),
  ]),
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
            typeof bodyText === 'string'
              ? (JSON.parse(bodyText) as { readonly tsSource: string }).tsSource
              : '';
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
                        message:
                          'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
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
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    );
    vi.stubGlobal('EventSource', FakeEventSource);
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
    expect(screen.getByText('Build ready. Tessellation hash c3a9076d584f')).toBeDefined();
    expect(screen.getAllByText('width').length).toBeGreaterThan(0);
    expect(screen.getByText('10 mm')).toBeDefined();
    expect(screen.getByTestId('document-save-status').textContent).toContain(
      'Saved source is ready to build.',
    );
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
    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });

    const editor = screen.getByTestId('document-source-editor');
    fireEvent.change(editor, {
      target: {
        value: `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 12, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="12" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
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
`,
      },
    });

    expect(screen.getByTestId('document-save-status').textContent).toContain(
      'Draft updated locally. Changes will autosave shortly.',
    );

    fireEvent.click(screen.getByTestId('document-save'));

    await waitFor(() => {
      expect(screen.getByTestId('document-save-status').textContent).toContain(
        'All changes saved to the server.',
      );
    });
  });

  it('applies parameter inspector edits back into canonical source', async () => {
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
    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });

    fireEvent.click(screen.getByTestId('authoring-parameter-parameter_1'));
    await waitFor(() => {
      expect(screen.getByTestId('document-inspector-parameter')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('document-inspector-parameter-value'), {
      target: { value: '14' },
    });
    fireEvent.click(screen.getByTestId('document-inspector-save-parameter'));

    await waitFor(() => {
      expect((screen.getByTestId('document-source-editor') as HTMLTextAreaElement).value).toContain(
        "width: { kind: 'number', value: 14, unit: 'mm' }",
      );
    });
    expect(screen.getByTestId('document-save-status').textContent).toContain(
      'Draft updated locally',
    );
    expect((screen.getByTestId('document-undo') as HTMLButtonElement).disabled).toBe(false);
  });

  it('undoes and redoes source edits through the shared authoring history controls', async () => {
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
    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });

    const editor = screen.getByTestId('document-source-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, {
      target: {
        value: editor.value.replace('value: 10', 'value: 14'),
      },
    });

    expect(editor.value).toContain('value: 14');
    expect((screen.getByTestId('document-undo') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('document-undo'));

    await waitFor(() => {
      expect((screen.getByTestId('document-source-editor') as HTMLTextAreaElement).value).toContain(
        'value: 10',
      );
    });
    expect((screen.getByTestId('document-redo') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId('document-redo'));

    await waitFor(() => {
      expect((screen.getByTestId('document-source-editor') as HTMLTextAreaElement).value).toContain(
        'value: 14',
      );
    });
    expect(screen.getByText('1 undo / 0 redo')).toBeDefined();
  });

  it('applies sketch dimension edits back into canonical source', async () => {
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

    fireEvent.click(screen.getByTestId('authoring-feature-sketch_1'));
    await waitFor(() => {
      expect(screen.getByTestId('document-inspector-feature')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('document-inspector-edit-sketch'));

    await waitFor(() => {
      expect(screen.getByTestId('sketch-mode')).toBeDefined();
    });

    fireEvent.change(screen.getByTestId('sketch-width-binding'), {
      target: { value: 'literal' },
    });
    fireEvent.change(screen.getByTestId('sketch-width-literal'), {
      target: { value: '26' },
    });
    fireEvent.click(screen.getByTestId('sketch-apply-bindings'));

    await waitFor(() => {
      expect(screen.getByTestId('sketch-preview-size').textContent).toContain('26 × 20 mm');
    });
    await waitFor(() => {
      expect((screen.getByTestId('document-source-editor') as HTMLTextAreaElement).value).toContain(
        "width: { kind: 'literal', value: 26, unit: 'mm' }",
      );
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
    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });

    fireEvent.change(screen.getByTestId('document-source-editor'), {
      target: {
        value: `import { body, defineDocument, feature, pad, parameters, reference, sketch } from '@cad/sdk';

export default defineDocument({
  parameters: parameters({
    width: { kind: 'number', value: 14, unit: 'mm' },
    depth: { kind: 'number', value: 20, unit: 'mm' },
    height: { kind: 'number', value: 30, unit: 'mm' },
  }),
  body: body([
    sketch({
      id: 'sketch_1',
      plane: 'xy',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 120 90" data-cad-plane="xy" data-cad-kind="rectangle">  <rect x="0" y="0" width="14" height="20" fill="none" stroke="currentColor" stroke-width="1" /></svg>',
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
`,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'You have unsaved document changes. Leave this page and discard the current draft?',
    );
    expect(globalThis.location.pathname).toBe(
      '/projects/01HQ8K3VBRZ8XGRGY5T0WJD8AH/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF',
    );
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
    expect(screen.getByTestId('document-diagnostics').textContent).toContain(
      'runtime.unsupported_import',
    );

    const editor = screen.getByTestId('document-source-editor') as HTMLTextAreaElement;
    fireEvent.click(screen.getByTestId('document-diagnostic-0'));

    expect(editor.selectionStart).toBe(8);
    expect(editor.selectionEnd).toBe(15);
    expect(screen.getByTestId('document-diagnostics').textContent).toContain(
      'Line 1, columns 9-16',
    );

    failBuildRequest = false;
    fireEvent.click(screen.getByTestId('document-diagnostics-retry'));

    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
    });
  });

  it('updates the viewport when a build event arrives over the document stream', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewport')).toBeDefined();
    });

    const stream = FakeEventSource.instances.at(-1);
    expect(stream?.url).toContain('/documents/01HQ8K3VBRZ8XGRGY5T0WJD8AF/events');
    expect(stream?.withCredentials).toBe(true);

    stream?.emit('message', {
      type: 'documents.build.ready',
      payload: {
        ...BUILD_RESPONSE,
        build: {
          ...BUILD_RESPONSE.build,
          tessellation: {
            ...BUILD_RESPONSE.build.tessellation,
            metadata: {
              ...BUILD_RESPONSE.build.tessellation.metadata,
              hash: 'f'.repeat(64),
            },
          },
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewport').textContent).toContain('f'.repeat(64));
    });
    expect(screen.getByTestId('document-build-status').textContent).toContain('Build ready');
  });

  it('shows remote running state without clearing the last successful viewport', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewport').textContent).toContain(
        'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
      );
    });

    const stream = FakeEventSource.instances.at(-1);
    stream?.emit('message', {
      type: 'documents.build.running',
      payload: {
        documentId: '01HQ8K3VBRZ8XGRGY5T0WJD8AF',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain(
        'A build started in another session.',
      );
    });
    expect(screen.getByTestId('mock-viewport').textContent).toContain(
      'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
    );
    expect(screen.getByTestId('document-viewport-summary').textContent).toContain(
      'Showing the last successful build while a newer streamed build is running',
    );
  });

  it('shows streamed diagnostics on remote build failure while keeping the last successful viewport', async () => {
    const { App } = await import('../src/App.js');
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={makeQueryClient()}>
          <App />
        </QueryClientProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-viewport').textContent).toContain(
        'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
      );
    });

    const stream = FakeEventSource.instances.at(-1);
    stream?.emit('message', {
      type: 'documents.build.failed',
      payload: {
        documentId: '01HQ8K3VBRZ8XGRGY5T0WJD8AF',
        message: 'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
        diagnostics: [
          {
            code: 'runtime.unsupported_import',
            message: 'Only "@cad/sdk" imports are allowed in document.ts, received "node:fs".',
            range: { start: 8, end: 15 },
            path: ['imports', '0'],
          },
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('document-build-status').textContent).toContain(
        'A streamed build failed in another session.',
      );
    });
    expect(screen.getByTestId('document-diagnostics').textContent).toContain(
      'runtime.unsupported_import',
    );
    expect(screen.getByTestId('mock-viewport').textContent).toContain(
      'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
    );
    expect(screen.getByTestId('document-viewport-summary').textContent).toContain(
      'Showing the last successful build because the latest streamed build failed',
    );
  });
});

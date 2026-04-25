import { I18nProvider, createBrowserI18n } from '@cad/i18n';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Viewport } from '../src/viewport/Viewport.js';

import type { SceneOptions } from '../src/lib/three-scene.js';

type I18nInstance = Awaited<ReturnType<typeof createBrowserI18n>>;

const createSceneMock = vi.fn();
let lastSceneOptions: SceneOptions | undefined;

vi.mock('../src/lib/three-scene.js', () => ({
  createScene: (...args: [HTMLCanvasElement, unknown, SceneOptions]) => {
    lastSceneOptions = args[2];
    return createSceneMock(...args);
  },
}));

vi.mock('../src/viewport/useKernelWorker.js', () => ({
  useKernelWorker: () => ({ result: null, error: null, pending: false }),
}));

const TESSELLATION = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  indices: new Uint32Array([0, 1, 2]),
  metadata: {
    hash: 'c3a9076d584ff45bacc82ee495860a8a60815b0f4f6e917edf2a6a437a427cb0',
    triangleCount: 1,
    vertexCount: 3,
    bbox: { min: [0, 0, 0], max: [1, 1, 0] },
  },
} as const;

describe('<Viewport />', () => {
  let i18n: I18nInstance;

  beforeAll(async () => {
    i18n = await createBrowserI18n({ initialLocale: 'en' });
  });

  beforeEach(() => {
    lastSceneOptions = undefined;
    localStorage.clear();
    createSceneMock.mockReset();
    createSceneMock.mockReturnValue({
      renderer: {},
      resize: vi.fn(),
      render: vi.fn(),
      setProjection: vi.fn(),
      setVisualStyle: vi.fn(),
      setSelectionFilter: vi.fn(),
      setCameraState: vi.fn(),
      applyNamedView: vi.fn((namedView: 'front' | 'iso' | 'right' | 'top') => ({
        yaw: namedView === 'right' ? Math.PI / 2 : 0,
        pitch: namedView === 'top' ? Math.PI / 2 - 0.0001 : 0.55,
        distance: 120,
        zoom: 1,
        target: [0, 0, 0] as const,
      })),
      handlePointerDown: vi.fn(),
      handlePointerMove: vi.fn(),
      handlePointerUp: vi.fn(),
      handlePointerLeave: vi.fn(),
      handleWheel: vi.fn(),
      dispose: vi.fn(),
    });
  });

  it('renders controls, updates stateful attrs, and persists settings', () => {
    render(
      <I18nProvider i18n={i18n}>
        <Viewport tessellation={TESSELLATION} storageKey="doc-123" />
      </I18nProvider>,
    );

    const root = screen.getByTestId('viewport-root');
    expect(root.dataset.cameraMode).toBe('perspective');
    expect(root.dataset.namedView).toBe('iso');
    expect(root.dataset.visualStyle).toBe('shaded-edges');
    expect(root.dataset.selectionFilter).toBe('face');

    fireEvent.click(screen.getByRole('button', { name: 'Orthographic' }));
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'wireframe' } });
    fireEvent.change(screen.getByLabelText('Selection'), { target: { value: 'edge' } });
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));

    expect(root.dataset.cameraMode).toBe('orthographic');
    expect(root.dataset.namedView).toBe('right');
    expect(root.dataset.visualStyle).toBe('wireframe');
    expect(root.dataset.selectionFilter).toBe('edge');
    expect(root.textContent).toContain('Right');

    const persisted = JSON.parse(localStorage.getItem('cad:viewport:doc-123') ?? '{}') as {
      readonly projection?: string;
      readonly visualStyle?: string;
      readonly selectionFilter?: string;
      readonly namedView?: string;
    };
    expect(persisted.projection).toBe('orthographic');
    expect(persisted.visualStyle).toBe('wireframe');
    expect(persisted.selectionFilter).toBe('edge');
    expect(persisted.namedView).toBe('right');
  });

  it('reflects scene selection callbacks in the status bar', () => {
    render(
      <I18nProvider i18n={i18n}>
        <Viewport tessellation={TESSELLATION} />
      </I18nProvider>,
    );

    act(() => {
      lastSceneOptions?.onSelectionChange?.({
        kind: 'face',
        index: 2,
        label: 'Face 3',
      });
    });

    expect(screen.getByTestId('viewport-statusbar').textContent).toContain('Faces: Face 3');
  });
});

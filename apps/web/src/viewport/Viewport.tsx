import { useT } from '@cad/i18n';
import { createHandleFromEntity, findEntityByRawSelection, resolveHandle } from '@cad/references';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createScene, type SceneHandles } from '../lib/three-scene.js';

import {
  DEFAULT_VIEWPORT_SETTINGS,
  buildNamedViewCameraState,
  loadViewportSettings,
  saveViewportSettings,
  type NamedView,
  type ProjectionMode,
  type SelectionFilter,
  type ViewportSelection,
  type ViewportSettings,
  type VisualStyle,
} from './state.js';
import { useKernelWorker } from './useKernelWorker.js';

import type { BoxInput, TessellationResult } from '@cad/kernel';
import type { Handle, ResolutionResult, Topology } from '@cad/references';

export interface ViewportProps {
  readonly box?: BoxInput;
  readonly tessellation?: TessellationResult;
  readonly storageKey?: string;
  readonly topology?: Topology;
  readonly onHandleSelection?: (selection: ReferenceSelection | null) => void;
}

export interface ReferenceSelection {
  readonly raw: ViewportSelection;
  readonly handle: Handle;
  readonly resolution: ResolutionResult;
}

export function Viewport({
  box,
  tessellation,
  storageKey,
  topology,
  onHandleSelection,
}: ViewportProps): React.JSX.Element {
  const { t } = useT('viewport');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlesRef = useRef<SceneHandles | null>(null);
  const workerState = useKernelWorker(box ?? null);
  const result = tessellation ?? workerState.result;
  const error = tessellation === undefined ? workerState.error : null;
  const pending = tessellation === undefined ? workerState.pending : false;

  const initialSettings = useMemo<ViewportSettings>(() => {
    if (storageKey === undefined) {
      return DEFAULT_VIEWPORT_SETTINGS;
    }
    return loadViewportSettings(storageKey) ?? DEFAULT_VIEWPORT_SETTINGS;
  }, [storageKey]);

  const [settings, setSettings] = useState<ViewportSettings>(initialSettings);
  const [selection, setSelection] = useState<ViewportSelection | null>(null);
  const [referenceSelection, setReferenceSelection] = useState<ReferenceSelection | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);

  const applyReferenceSelection = useCallback(
    (nextSelection: ViewportSelection | null): void => {
      setSelection(nextSelection);
      if (nextSelection === null || topology === undefined) {
        setReferenceSelection(null);
        onHandleSelection?.(null);
        return;
      }
      const entity = findEntityByRawSelection(topology, nextSelection);
      if (entity === null) {
        setReferenceSelection(null);
        onHandleSelection?.(null);
        return;
      }
      const handle = createHandleFromEntity(entity);
      const resolved = resolveHandle(handle, topology);
      const nextReferenceSelection = {
        raw: nextSelection,
        handle,
        resolution: resolved,
      };
      setReferenceSelection(nextReferenceSelection);
      onHandleSelection?.(nextReferenceSelection);
    },
    [onHandleSelection, topology],
  );

  useEffect(() => {
    if (storageKey === undefined) {
      return;
    }
    saveViewportSettings(storageKey, settings);
  }, [settings, storageKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || result === null) {
      return;
    }
    const activeCanvas = canvas;

    const handles = createScene(activeCanvas, result, {
      camera: initialSettings.camera,
      projection: initialSettings.projection,
      selectionFilter: initialSettings.selectionFilter,
      visualStyle: initialSettings.visualStyle,
      onCameraChange(nextCamera) {
        setSettings((current) => ({ ...current, camera: nextCamera }));
      },
      onSelectionChange(nextSelection) {
        applyReferenceSelection(nextSelection);
      },
    });
    handlesRef.current = handles;

    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            handles.resize();
          });
    resizeObserver?.observe(activeCanvas);

    function handlePointerDown(event: PointerEvent): void {
      activeCanvas.setPointerCapture?.(event.pointerId);
      setIsInteracting(true);
      handles.handlePointerDown(event);
    }

    function handlePointerMove(event: PointerEvent): void {
      handles.handlePointerMove(event);
    }

    function handlePointerUp(event: PointerEvent): void {
      setIsInteracting(false);
      handles.handlePointerUp(event);
      if (activeCanvas.hasPointerCapture?.(event.pointerId)) {
        activeCanvas.releasePointerCapture(event.pointerId);
      }
    }

    function handlePointerLeave(): void {
      setIsInteracting(false);
      handles.handlePointerLeave();
    }

    function handleWheel(event: WheelEvent): void {
      handles.handleWheel(event);
    }

    function handleContextMenu(event: MouseEvent): void {
      event.preventDefault();
    }

    activeCanvas.addEventListener('pointerdown', handlePointerDown);
    activeCanvas.addEventListener('pointermove', handlePointerMove);
    activeCanvas.addEventListener('pointerup', handlePointerUp);
    activeCanvas.addEventListener('pointerleave', handlePointerLeave);
    activeCanvas.addEventListener('wheel', handleWheel, { passive: false });
    activeCanvas.addEventListener('contextmenu', handleContextMenu);
    handles.resize();

    return () => {
      resizeObserver?.disconnect();
      activeCanvas.removeEventListener('pointerdown', handlePointerDown);
      activeCanvas.removeEventListener('pointermove', handlePointerMove);
      activeCanvas.removeEventListener('pointerup', handlePointerUp);
      activeCanvas.removeEventListener('pointerleave', handlePointerLeave);
      activeCanvas.removeEventListener('wheel', handleWheel);
      activeCanvas.removeEventListener('contextmenu', handleContextMenu);
      handles.dispose();
      handlesRef.current = null;
    };
  }, [applyReferenceSelection, initialSettings, result]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const testRoot = root as {
      __cadSelectReference?: (
        selection?: { readonly kind?: SelectionFilter; readonly index?: number },
      ) => void;
    };
    testRoot.__cadSelectReference = (nextSelection = {}) => {
      applyReferenceSelection({
        kind: nextSelection.kind ?? 'face',
        index: nextSelection.index ?? 0,
        label: `Face ${(nextSelection.index ?? 0) + 1}`,
      });
    };
    return () => {
      delete testRoot.__cadSelectReference;
    };
  }, [applyReferenceSelection]);

  function updateProjection(projection: ProjectionMode): void {
    handlesRef.current?.setProjection(projection);
    setSettings((current) => ({ ...current, projection }));
  }

  function updateVisualStyle(visualStyle: VisualStyle): void {
    handlesRef.current?.setVisualStyle(visualStyle);
    setSettings((current) => ({ ...current, visualStyle }));
  }

  function updateSelectionFilter(selectionFilter: SelectionFilter): void {
    handlesRef.current?.setSelectionFilter(selectionFilter);
    setSelection(null);
    setSettings((current) => ({ ...current, selectionFilter }));
  }

  function applyNamedView(namedView: NamedView): void {
    const nextCamera =
      handlesRef.current?.applyNamedView(namedView) ??
      buildNamedViewCameraState(namedView, settings.camera);
    setSettings((current) => ({
      ...current,
      namedView,
      camera: nextCamera,
    }));
  }

  const meshSummary =
    result === null
      ? null
      : t('mesh.summary', {
          triangles: result.metadata.triangleCount,
          hashPrefix: result.metadata.hash.slice(0, 12),
        });

  const selectionText =
    selection === null
      ? t('status.selection_none')
      : t('status.selection_value', {
          kind: t(`filters.${selection.kind}`),
          label: selection.label,
        });
  const referenceText =
    referenceSelection === null
      ? 'No handle'
      : `${referenceSelection.handle.label ?? referenceSelection.handle.id} · ${
          referenceSelection.resolution.ok
            ? `resolved by ${referenceSelection.resolution.layer ?? 'unknown'}`
            : 'unresolved'
        }`;

  const cameraDistance = Math.round(settings.camera.distance);

  return (
    <div
      ref={rootRef}
      className="cad-viewport"
      data-tessellation-hash={result?.metadata.hash ?? ''}
      data-camera-mode={settings.projection}
      data-named-view={settings.namedView}
      data-visual-style={settings.visualStyle}
      data-selection-filter={settings.selectionFilter}
      data-reference-handle={referenceSelection?.handle.id ?? ''}
      data-reference-layer={referenceSelection?.resolution.layer ?? ''}
      data-testid="viewport-root"
    >
      <div className="cad-viewport__toolbar" data-testid="viewport-toolbar">
        <div className="cad-viewport__group" role="group" aria-label={t('groups.projection')}>
          <span className="cad-viewport__group-label">{t('groups.projection')}</span>
          <div className="cad-viewport__segmented">
            <ViewportToggle
              label={t('projection.perspective')}
              active={settings.projection === 'perspective'}
              onClick={() => updateProjection('perspective')}
            />
            <ViewportToggle
              label={t('projection.orthographic')}
              active={settings.projection === 'orthographic'}
              onClick={() => updateProjection('orthographic')}
            />
          </div>
        </div>

        <div className="cad-viewport__group" role="group" aria-label={t('groups.views')}>
          <span className="cad-viewport__group-label">{t('groups.views')}</span>
          <div className="cad-viewport__segmented">
            <ViewportToggle
              label={t('views.iso')}
              active={settings.namedView === 'iso'}
              onClick={() => applyNamedView('iso')}
            />
            <ViewportToggle
              label={t('views.front')}
              active={settings.namedView === 'front'}
              onClick={() => applyNamedView('front')}
            />
            <ViewportToggle
              label={t('views.top')}
              active={settings.namedView === 'top'}
              onClick={() => applyNamedView('top')}
            />
            <ViewportToggle
              label={t('views.right')}
              active={settings.namedView === 'right'}
              onClick={() => applyNamedView('right')}
            />
          </div>
        </div>

        <ViewportSelect<VisualStyle>
          testId="viewport-style"
          label={t('groups.style')}
          value={settings.visualStyle}
          onChange={updateVisualStyle}
          options={[
            { value: 'shaded', label: t('styles.shaded') },
            { value: 'shaded-edges', label: t('styles.shaded_edges') },
            { value: 'wireframe', label: t('styles.wireframe') },
          ]}
        />

        <ViewportSelect<SelectionFilter>
          testId="viewport-filter"
          label={t('groups.filter')}
          value={settings.selectionFilter}
          onChange={updateSelectionFilter}
          options={[
            { value: 'face', label: t('filters.face') },
            { value: 'edge', label: t('filters.edge') },
            { value: 'vertex', label: t('filters.vertex') },
          ]}
        />
      </div>

      <div className="cad-viewport__canvas-shell">
        <canvas ref={canvasRef} className="cad-viewport__canvas" data-testid="viewport-canvas" />
        <div className="cad-viewport__overlay cad-viewport__overlay--left">
          {pending && !error && <ViewportNote tone="neutral">{t('kernel.booting')}</ViewportNote>}
          {error && (
            <ViewportNote tone="danger">{t('kernel.error', { message: error })}</ViewportNote>
          )}
          {meshSummary !== null && <ViewportNote tone="neutral">{meshSummary}</ViewportNote>}
        </div>
        <div className="cad-viewport__overlay cad-viewport__overlay--right">
          <ViewportHint>{isInteracting ? t('hints.interacting') : t('hints.default')}</ViewportHint>
        </div>
      </div>

      <div className="cad-viewport__statusbar" data-testid="viewport-statusbar">
        <span className="cad-viewport__status-item">
          <strong>{t('status.view_label')}</strong>
          <span>{t(`views.${settings.namedView}`)}</span>
        </span>
        <span className="cad-viewport__status-item">
          <strong>{t('status.projection_label')}</strong>
          <span>{t(`projection.${settings.projection}`)}</span>
        </span>
        <span className="cad-viewport__status-item">
          <strong>{t('status.filter_label')}</strong>
          <span>{t(`filters.${settings.selectionFilter}`)}</span>
        </span>
        <span className="cad-viewport__status-item">
          <strong>{t('status.selection_label')}</strong>
          <span>{selectionText}</span>
        </span>
        <span className="cad-viewport__status-item" data-testid="viewport-reference-status">
          <strong>Reference</strong>
          <span>{referenceText}</span>
        </span>
        <span className="cad-viewport__status-item">
          <strong>{t('status.distance_label')}</strong>
          <span>{t('status.distance_value', { distance: cameraDistance })}</span>
        </span>
      </div>
    </div>
  );
}

function ViewportToggle({
  active,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={
        active ? 'cad-viewport__toggle cad-viewport__toggle--active' : 'cad-viewport__toggle'
      }
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ViewportSelect<Value extends string>({
  label,
  onChange,
  options,
  testId,
  value,
}: {
  readonly label: string;
  readonly onChange: (value: Value) => void;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly testId: string;
  readonly value: Value;
}): React.JSX.Element {
  return (
    <label className="cad-viewport__select" data-testid={testId}>
      <span className="cad-viewport__group-label">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as Value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ViewportNote({
  children,
  tone,
}: {
  readonly children: React.ReactNode;
  readonly tone: 'danger' | 'neutral';
}): React.JSX.Element {
  return (
    <p
      className={
        tone === 'danger' ? 'cad-viewport__note cad-viewport__note--danger' : 'cad-viewport__note'
      }
    >
      {children}
    </p>
  );
}

function ViewportHint({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <p className="cad-viewport__hint">{children}</p>;
}

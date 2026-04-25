export type ProjectionMode = 'perspective' | 'orthographic';
export type VisualStyle = 'shaded' | 'shaded-edges' | 'wireframe';
export type NamedView = 'iso' | 'front' | 'top' | 'right';
export type SelectionFilter = 'face' | 'edge' | 'vertex';

export interface CameraState {
  readonly yaw: number;
  readonly pitch: number;
  readonly distance: number;
  readonly zoom: number;
  readonly target: readonly [number, number, number];
}

export interface ViewportSettings {
  readonly projection: ProjectionMode;
  readonly visualStyle: VisualStyle;
  readonly namedView: NamedView;
  readonly selectionFilter: SelectionFilter;
  readonly camera: CameraState;
}

export interface ViewportSelection {
  readonly kind: SelectionFilter;
  readonly index: number;
  readonly label: string;
}

const STORAGE_PREFIX = 'cad:viewport:';

export const DEFAULT_CAMERA_STATE: CameraState = {
  yaw: Math.PI / 4,
  pitch: 0.55,
  distance: 120,
  zoom: 1,
  target: [0, 0, 0],
};

export const DEFAULT_VIEWPORT_SETTINGS: ViewportSettings = {
  projection: 'perspective',
  visualStyle: 'shaded-edges',
  namedView: 'iso',
  selectionFilter: 'face',
  camera: DEFAULT_CAMERA_STATE,
};

export function storageKeyForViewport(storageKey: string): string {
  return `${STORAGE_PREFIX}${storageKey}`;
}

export function buildNamedViewCameraState(
  namedView: NamedView,
  previous: CameraState = DEFAULT_CAMERA_STATE,
): CameraState {
  switch (namedView) {
    case 'front': {
      return { ...previous, yaw: 0, pitch: 0, target: [0, 0, 0] };
    }
    case 'top': {
      return { ...previous, yaw: 0, pitch: Math.PI / 2 - 0.0001, target: [0, 0, 0] };
    }
    case 'right': {
      return { ...previous, yaw: Math.PI / 2, pitch: 0, target: [0, 0, 0] };
    }
    case 'iso':
    {
      return { ...previous, yaw: Math.PI / 4, pitch: 0.55, target: [0, 0, 0] };
    }
  }
}

export function saveViewportSettings(storageKey: string, settings: ViewportSettings): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(storageKeyForViewport(storageKey), JSON.stringify(settings));
}

export function loadViewportSettings(storageKey: string): ViewportSettings | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(storageKeyForViewport(storageKey));
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ViewportSettings>;
    return normalizeViewportSettings(parsed);
  } catch {
    return null;
  }
}

export function normalizeViewportSettings(parsed: Partial<ViewportSettings>): ViewportSettings {
  const namedView = isNamedView(parsed.namedView) ? parsed.namedView : DEFAULT_VIEWPORT_SETTINGS.namedView;
  const projection = isProjectionMode(parsed.projection)
    ? parsed.projection
    : DEFAULT_VIEWPORT_SETTINGS.projection;
  const visualStyle = isVisualStyle(parsed.visualStyle)
    ? parsed.visualStyle
    : DEFAULT_VIEWPORT_SETTINGS.visualStyle;
  const selectionFilter = isSelectionFilter(parsed.selectionFilter)
    ? parsed.selectionFilter
    : DEFAULT_VIEWPORT_SETTINGS.selectionFilter;

  const fallbackCamera = buildNamedViewCameraState(namedView, DEFAULT_CAMERA_STATE);
  const camera = parsed.camera;
  return {
    projection,
    visualStyle,
    namedView,
    selectionFilter,
    camera: {
      yaw: isFiniteNumber(camera?.yaw) ? camera.yaw : fallbackCamera.yaw,
      pitch: isFiniteNumber(camera?.pitch) ? camera.pitch : fallbackCamera.pitch,
      distance: isFiniteNumber(camera?.distance) ? camera.distance : fallbackCamera.distance,
      zoom: isFiniteNumber(camera?.zoom) ? camera.zoom : fallbackCamera.zoom,
      target: normalizeTarget(camera?.target, fallbackCamera.target),
    },
  };
}

function normalizeTarget(
  value: CameraState['target'] | undefined,
  fallback: CameraState['target'],
): CameraState['target'] {
  if (!Array.isArray(value) || value.length !== 3) {
    return fallback;
  }
  if (value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return [value[0], value[1], value[2]];
  }
  return fallback;
}

function isProjectionMode(value: unknown): value is ProjectionMode {
  return value === 'perspective' || value === 'orthographic';
}

function isVisualStyle(value: unknown): value is VisualStyle {
  return value === 'shaded' || value === 'shaded-edges' || value === 'wireframe';
}

function isNamedView(value: unknown): value is NamedView {
  return value === 'iso' || value === 'front' || value === 'top' || value === 'right';
}

function isSelectionFilter(value: unknown): value is SelectionFilter {
  return value === 'face' || value === 'edge' || value === 'vertex';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

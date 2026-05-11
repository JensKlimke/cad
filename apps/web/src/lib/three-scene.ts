import {
  AmbientLight,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Points,
  PointsMaterial,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  buildNamedViewCameraState,
  type CameraState,
  type NamedView,
  type ProjectionMode,
  type SelectionFilter,
  type ViewportSelection,
  type VisualStyle,
} from '../viewport/state.js';

import type { TessellationResult } from '@cad/kernel';

export interface SceneOptions {
  readonly camera?: CameraState;
  readonly projection?: ProjectionMode;
  readonly selectionFilter?: SelectionFilter;
  readonly visualStyle?: VisualStyle;
  readonly onCameraChange?: (camera: CameraState) => void;
  readonly onSelectionChange?: (selection: ViewportSelection | null) => void;
}

export interface PointerLikeEvent {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  readonly buttons: number;
  readonly pointerId?: number;
  readonly preventDefault?: () => void;
}

export interface WheelLikeEvent {
  readonly deltaX?: number;
  readonly deltaY: number;
  readonly deltaMode?: number;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly preventDefault?: () => void;
}

export type WheelIntent = 'orbit' | 'pan' | 'zoom';

export interface SceneHandles {
  readonly renderer: WebGLRenderer;
  readonly resize: () => void;
  readonly render: () => void;
  readonly setProjection: (projection: ProjectionMode) => void;
  readonly setVisualStyle: (style: VisualStyle) => void;
  readonly setSelectionFilter: (filter: SelectionFilter) => void;
  readonly setCameraState: (state: CameraState) => void;
  readonly applyNamedView: (namedView: NamedView) => CameraState;
  readonly handlePointerDown: (event: PointerLikeEvent) => void;
  readonly handlePointerMove: (event: PointerLikeEvent) => void;
  readonly handlePointerUp: (event: PointerLikeEvent) => void;
  readonly handlePointerLeave: () => void;
  readonly handleWheel: (event: WheelLikeEvent) => void;
  readonly dispose: () => void;
}

const BACKGROUND_HEX = 0x05_0a_12;
const FACE_COLOR = 0x73_d0_ff;
const FACE_HOVER = 0x96_de_ff;
const FACE_SELECTED = 0xff_bc_67;
const EDGE_COLOR = 0x47_68_88;
const EDGE_HOVER = 0x99_cb_ff;
const EDGE_SELECTED = 0xff_c1_73;
const VERTEX_COLOR = 0xa9_d7_ff;
const VERTEX_HOVER = 0xc7_e6_ff;
const VERTEX_SELECTED = 0xff_c1_73;
const AMBIENT_INTENSITY = 0.5;
const DIRECTIONAL_INTENSITY = 1.15;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 5000;
const CAMERA_FOV_DEG = 34;
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 4000;
const MIN_PITCH = -Math.PI / 2 + 0.025;
const MAX_PITCH = Math.PI / 2 - 0.025;
const CLICK_DRAG_THRESHOLD = 3;
const ZOOM_SENSITIVITY = 0.0014;
const ORBIT_SPEED = 0.0085;
const PAN_SPEED = 0.0022;
const TRACKPAD_ORBIT_SPEED = 0.0054;
const TRACKPAD_PAN_SPEED = 0.0018;
const POINT_SIZE = 5.4;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const LINE_DELTA_PIXELS = 16;
const PAGE_DELTA_PIXELS = 800;
const TRACKPAD_WHEEL_DELTA_THRESHOLD = 48;

type InteractionMode = 'orbit' | 'pan';

interface PickResult {
  readonly selection: ViewportSelection;
}

export function createScene(
  canvas: HTMLCanvasElement,
  tessellation: TessellationResult,
  options: SceneOptions = {},
): SceneHandles {
  const scene = new Scene();
  scene.background = new Color(BACKGROUND_HEX);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(globalThis.devicePixelRatio ?? 1);

  const perspectiveCamera = new PerspectiveCamera(CAMERA_FOV_DEG, 1, CAMERA_NEAR, CAMERA_FAR);
  const orthographicCamera = new OrthographicCamera(-1, 1, 1, -1, CAMERA_NEAR, CAMERA_FAR);

  const root = new Group();
  scene.add(root);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(tessellation.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(tessellation.normals, 3));
  geometry.setIndex(new BufferAttribute(tessellation.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const bounds =
    geometry.boundingBox ?? new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10));
  const sphere = geometry.boundingSphere ?? new Sphere(new Vector3(), 10);
  const center = bounds.getCenter(new Vector3());
  const radius = Math.max(sphere.radius, 1);

  const faceMaterial = new MeshStandardMaterial({
    color: FACE_COLOR,
    metalness: 0.08,
    roughness: 0.4,
  });
  const edgeMaterial = new LineBasicMaterial({
    color: EDGE_COLOR,
    transparent: true,
    opacity: 0.92,
  });
  const vertexMaterial = new PointsMaterial({
    color: VERTEX_COLOR,
    size: POINT_SIZE,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.94,
  });

  const mesh = new Mesh(geometry, faceMaterial);
  mesh.position.sub(center);
  root.add(mesh);

  const edgesGeometry = new EdgesGeometry(geometry, 24);
  const edges = new LineSegments(edgesGeometry, edgeMaterial);
  edges.position.copy(mesh.position);
  root.add(edges);

  const pointsGeometry = new BufferGeometry();
  pointsGeometry.setAttribute('position', new BufferAttribute(tessellation.positions, 3));
  const points = new Points(pointsGeometry, vertexMaterial);
  points.position.copy(mesh.position);
  root.add(points);

  scene.add(new AmbientLight(0xff_ff_ff, AMBIENT_INTENSITY));
  const directional = new DirectionalLight(0xff_ff_ff, DIRECTIONAL_INTENSITY);
  directional.position.set(120, 180, 140);
  scene.add(directional);

  const raycaster = new Raycaster();
  raycaster.params.Line = { threshold: radius * 0.02 };
  raycaster.params.Points = { threshold: radius * 0.03 };
  const pointer = new Vector2();
  const orbitOffset = new Vector3();
  const cameraRight = new Vector3();
  const cameraUp = new Vector3();
  const tempTarget = new Vector3();
  const tempVector = new Vector3();
  const panPlane = new Plane();
  const panCurrent = new Vector3();

  let projection: ProjectionMode = options.projection ?? 'perspective';
  let selectionFilter: SelectionFilter = options.selectionFilter ?? 'face';
  let visualStyle: VisualStyle = options.visualStyle ?? 'shaded-edges';
  let cameraState =
    options.camera ??
    buildNamedViewCameraState('iso', {
      yaw: Math.PI / 4,
      pitch: 0.55,
      distance: Math.max(radius * 3.5, 70),
      zoom: 1,
      target: [0, 0, 0],
    });
  let hovered: ViewportSelection | null = null;
  let selected: ViewportSelection | null = null;
  let disposed = false;
  let interaction: {
    readonly mode: InteractionMode;
    readonly pointerId: number;
    readonly startClientX: number;
    readonly startClientY: number;
    readonly startYaw: number;
    readonly startPitch: number;
    readonly startCameraTarget: readonly [number, number, number];
    readonly startDistance: number;
    readonly panAnchor: Vector3 | null;
  } | null = null;

  function getActiveCamera(): PerspectiveCamera | OrthographicCamera {
    return projection === 'perspective' ? perspectiveCamera : orthographicCamera;
  }

  function emitCameraChange(): void {
    options.onCameraChange?.(cameraState);
  }

  function emitSelectionChange(): void {
    options.onSelectionChange?.(selected);
  }

  function updatePointer(clientX: number, clientY: number): void {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);
    pointer.x = ((clientX - bounds.left) / width) * 2 - 1;
    pointer.y = -(((clientY - bounds.top) / height) * 2 - 1);
  }

  function applyCamera(): void {
    const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
    perspectiveCamera.aspect = aspect;

    const target = tempTarget.fromArray(cameraState.target);
    orbitOffset.set(
      Math.cos(cameraState.pitch) * Math.sin(cameraState.yaw),
      Math.sin(cameraState.pitch),
      Math.cos(cameraState.pitch) * Math.cos(cameraState.yaw),
    );

    const perspectiveDistance = Math.max(cameraState.distance, MIN_DISTANCE);
    perspectiveCamera.position.copy(target).addScaledVector(orbitOffset, perspectiveDistance);
    perspectiveCamera.lookAt(target);
    perspectiveCamera.updateProjectionMatrix();

    const orthoDistance = Math.max(cameraState.distance, MIN_DISTANCE);
    const halfHeight = Math.max(
      (orthoDistance / Math.max(cameraState.zoom, 0.2)) * 0.38,
      radius * 0.35,
    );
    const halfWidth = halfHeight * aspect;
    orthographicCamera.left = -halfWidth;
    orthographicCamera.right = halfWidth;
    orthographicCamera.top = halfHeight;
    orthographicCamera.bottom = -halfHeight;
    orthographicCamera.position.copy(target).addScaledVector(orbitOffset, orthoDistance);
    orthographicCamera.lookAt(target);
    orthographicCamera.zoom = 1;
    orthographicCamera.updateProjectionMatrix();
  }

  function applyVisualStyle(): void {
    if (visualStyle === 'wireframe') {
      faceMaterial.wireframe = true;
      faceMaterial.opacity = 0.2;
      faceMaterial.transparent = true;
      edges.visible = true;
      points.visible = selectionFilter === 'vertex';
    } else {
      faceMaterial.wireframe = false;
      faceMaterial.opacity = 1;
      faceMaterial.transparent = false;
      edges.visible = visualStyle === 'shaded-edges';
      points.visible = selectionFilter === 'vertex';
    }
    applySelectionVisuals();
  }

  function applySelectionVisuals(): void {
    if (selected?.kind === 'face') {
      faceMaterial.color.setHex(FACE_SELECTED);
      faceMaterial.emissive.setHex(0x3d_24_08);
    } else if (hovered?.kind === 'face') {
      faceMaterial.color.setHex(FACE_HOVER);
      faceMaterial.emissive.setHex(0x10_2a_3a);
    } else {
      faceMaterial.color.setHex(FACE_COLOR);
      faceMaterial.emissive.setHex(0x00_00_00);
    }

    edgeMaterial.color.setHex(
      resolveSelectionColor(selected, hovered, 'edge', EDGE_SELECTED, EDGE_HOVER, EDGE_COLOR),
    );
    vertexMaterial.color.setHex(
      resolveSelectionColor(
        selected,
        hovered,
        'vertex',
        VERTEX_SELECTED,
        VERTEX_HOVER,
        VERTEX_COLOR,
      ),
    );
    vertexMaterial.size = selected?.kind === 'vertex' ? POINT_SIZE + 1.6 : POINT_SIZE;
    points.visible = visualStyle === 'wireframe' || selectionFilter === 'vertex';
  }

  function render(): void {
    if (disposed) {
      return;
    }
    renderer.render(scene, getActiveCamera());
  }

  function resize(): void {
    if (disposed) {
      return;
    }
    renderer.setSize(Math.max(canvas.clientWidth, 1), Math.max(canvas.clientHeight, 1), false);
    applyCamera();
    render();
  }

  function setProjection(nextProjection: ProjectionMode): void {
    projection = nextProjection;
    applyCamera();
    render();
  }

  function setVisualStyle(nextStyle: VisualStyle): void {
    visualStyle = nextStyle;
    applyVisualStyle();
    render();
  }

  function setSelectionFilter(nextFilter: SelectionFilter): void {
    selectionFilter = nextFilter;
    hovered = null;
    selected = null;
    emitSelectionChange();
    applyVisualStyle();
    render();
  }

  function setCameraState(nextState: CameraState): void {
    cameraState = {
      yaw: nextState.yaw,
      pitch: MathUtils.clamp(nextState.pitch, MIN_PITCH, MAX_PITCH),
      distance: MathUtils.clamp(nextState.distance, MIN_DISTANCE, MAX_DISTANCE),
      zoom: MathUtils.clamp(nextState.zoom, 0.35, 4),
      target: [...nextState.target] as CameraState['target'],
    };
    applyCamera();
    emitCameraChange();
    render();
  }

  function applyNamedView(namedView: NamedView): CameraState {
    const nextState = buildNamedViewCameraState(namedView, {
      ...cameraState,
      distance: Math.max(cameraState.distance, radius * 2.5),
      target: [0, 0, 0],
    });
    setCameraState(nextState);
    return nextState;
  }

  function pick(clientX: number, clientY: number): PickResult | null {
    updatePointer(clientX, clientY);
    const camera = getActiveCamera();
    raycaster.setFromCamera(pointer, camera);

    if (selectionFilter === 'face') {
      const hit = raycaster.intersectObject(mesh, false).at(0);
      if (hit?.faceIndex !== undefined && hit.faceIndex !== null) {
        return {
          selection: {
            kind: 'face',
            index: hit.faceIndex,
            label: `Face ${String(hit.faceIndex + 1)}`,
          },
        };
      }
      return null;
    }

    if (selectionFilter === 'edge') {
      const hit = raycaster.intersectObject(edges, false).at(0);
      if (hit?.index !== undefined) {
        const edgeIndex = Math.floor(hit.index / 2);
        return {
          selection: {
            kind: 'edge',
            index: edgeIndex,
            label: `Edge ${String(edgeIndex + 1)}`,
          },
        };
      }
      return null;
    }

    const hit = raycaster.intersectObject(points, false).at(0);
    const index = hit?.index ?? null;
    if (index !== null) {
      return {
        selection: {
          kind: 'vertex',
          index,
          label: `Vertex ${String(index + 1)}`,
        },
      };
    }
    return null;
  }

  function updateHover(selection: ViewportSelection | null): void {
    if (sameSelection(hovered, selection)) {
      return;
    }
    hovered = selection;
    applySelectionVisuals();
    render();
  }

  function handlePointerDown(event: PointerLikeEvent): void {
    event.preventDefault?.();
    const pointerId = event.pointerId ?? 0;
    const mode: InteractionMode = event.button === 1 || event.button === 2 ? 'pan' : 'orbit';
    let panAnchor: Vector3 | null = null;
    if (mode === 'pan') {
      updatePointer(event.clientX, event.clientY);
      panPlane.setFromNormalAndCoplanarPoint(
        getActiveCamera().getWorldDirection(tempVector).normalize(),
        tempTarget.fromArray(cameraState.target),
      );
      raycaster.setFromCamera(pointer, getActiveCamera());
      panAnchor = raycaster.ray.intersectPlane(panPlane, new Vector3());
    }
    interaction = {
      mode,
      pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startYaw: cameraState.yaw,
      startPitch: cameraState.pitch,
      startCameraTarget: cameraState.target,
      startDistance: cameraState.distance,
      panAnchor,
    };
  }

  function handlePointerMove(event: PointerLikeEvent): void {
    if (interaction !== null && interaction.pointerId === (event.pointerId ?? 0)) {
      event.preventDefault?.();
      if (interaction.mode === 'orbit') {
        setCameraState({
          ...cameraState,
          yaw: interaction.startYaw - (event.clientX - interaction.startClientX) * ORBIT_SPEED,
          pitch: interaction.startPitch - (event.clientY - interaction.startClientY) * ORBIT_SPEED,
        });
        return;
      }

      if (interaction.panAnchor !== null) {
        updatePointer(event.clientX, event.clientY);
        raycaster.setFromCamera(pointer, getActiveCamera());
        const hit = raycaster.ray.intersectPlane(panPlane, panCurrent);
        if (hit !== null) {
          const delta = hit.clone().sub(interaction.panAnchor);
          setCameraState({
            ...cameraState,
            target: [
              interaction.startCameraTarget[0] - delta.x,
              interaction.startCameraTarget[1] - delta.y,
              interaction.startCameraTarget[2] - delta.z,
            ],
          });
          return;
        }
      }

      const distanceScale = Math.max(interaction.startDistance, radius) * PAN_SPEED;
      cameraRight.setFromMatrixColumn(getActiveCamera().matrixWorld, 0).normalize();
      cameraUp
        .crossVectors(cameraRight, getActiveCamera().getWorldDirection(tempVector).normalize())
        .normalize();
      const deltaX = (event.clientX - interaction.startClientX) * distanceScale;
      const deltaY = (event.clientY - interaction.startClientY) * distanceScale;
      const origin = new Vector3().fromArray(interaction.startCameraTarget);
      origin.addScaledVector(cameraRight, -deltaX);
      origin.addScaledVector(cameraUp, deltaY);
      setCameraState({
        ...cameraState,
        target: [origin.x, origin.y, origin.z],
      });
      return;
    }

    const pickResult = pick(event.clientX, event.clientY);
    updateHover(pickResult?.selection ?? null);
  }

  function handlePointerUp(event: PointerLikeEvent): void {
    if (interaction === null || interaction.pointerId !== (event.pointerId ?? 0)) {
      return;
    }
    const moved =
      Math.abs(event.clientX - interaction.startClientX) > CLICK_DRAG_THRESHOLD ||
      Math.abs(event.clientY - interaction.startClientY) > CLICK_DRAG_THRESHOLD;
    interaction = null;
    if (moved) {
      return;
    }
    const pickResult = pick(event.clientX, event.clientY);
    selected = pickResult?.selection ?? null;
    emitSelectionChange();
    applySelectionVisuals();
    render();
  }

  function handlePointerLeave(): void {
    interaction = null;
    updateHover(null);
  }

  function panCameraByScreenDelta(deltaX: number, deltaY: number, speed: number): void {
    const distanceScale = Math.max(cameraState.distance, radius) * speed;
    cameraRight.setFromMatrixColumn(getActiveCamera().matrixWorld, 0).normalize();
    cameraUp
      .crossVectors(cameraRight, getActiveCamera().getWorldDirection(tempVector).normalize())
      .normalize();
    const origin = new Vector3().fromArray(cameraState.target);
    origin.addScaledVector(cameraRight, -deltaX * distanceScale);
    origin.addScaledVector(cameraUp, deltaY * distanceScale);
    setCameraState({
      ...cameraState,
      target: [origin.x, origin.y, origin.z],
    });
  }

  function orbitCameraByScreenDelta(deltaX: number, deltaY: number, speed: number): void {
    setCameraState({
      ...cameraState,
      // Trackpad orbit follows finger motion rather than mouse-drag camera steering.
      yaw: cameraState.yaw + deltaX * speed,
      pitch: cameraState.pitch + deltaY * speed,
    });
  }

  function zoomCameraByDelta(deltaY: number): void {
    const nextDistance = MathUtils.clamp(
      cameraState.distance * Math.exp(deltaY * ZOOM_SENSITIVITY),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );
    const nextZoom = MathUtils.clamp(
      cameraState.zoom * Math.exp(-deltaY * ZOOM_SENSITIVITY),
      0.35,
      4,
    );
    setCameraState({
      ...cameraState,
      distance: nextDistance,
      zoom: projection === 'orthographic' ? nextZoom : cameraState.zoom,
    });
  }

  function handleWheel(event: WheelLikeEvent): void {
    event.preventDefault?.();
    const deltaX = normalizeWheelDelta(event.deltaX ?? 0, event.deltaMode);
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode);
    switch (resolveWheelIntent(event)) {
      case 'orbit': {
        orbitCameraByScreenDelta(deltaX, deltaY, TRACKPAD_ORBIT_SPEED);
        return;
      }
      case 'pan': {
        panCameraByScreenDelta(deltaX, deltaY, TRACKPAD_PAN_SPEED);
        return;
      }
      case 'zoom': {
        zoomCameraByDelta(deltaY);
        return;
      }
    }
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    geometry.dispose();
    pointsGeometry.dispose();
    edgesGeometry.dispose();
    faceMaterial.dispose();
    edgeMaterial.dispose();
    vertexMaterial.dispose();
    renderer.dispose();
  }

  applyCamera();
  applyVisualStyle();
  resize();

  return {
    renderer,
    resize,
    render,
    setProjection,
    setVisualStyle,
    setSelectionFilter,
    setCameraState,
    applyNamedView,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handleWheel,
    dispose,
  };
}

export function resolveWheelIntent(event: WheelLikeEvent): WheelIntent {
  if (event.ctrlKey === true) {
    return 'zoom';
  }
  if (isTrackpadWheelEvent(event)) {
    return event.shiftKey === true ? 'orbit' : 'pan';
  }
  return 'zoom';
}

export function isTrackpadWheelEvent(event: WheelLikeEvent): boolean {
  const deltaX = Math.abs(normalizeWheelDelta(event.deltaX ?? 0, event.deltaMode));
  const deltaY = Math.abs(normalizeWheelDelta(event.deltaY, event.deltaMode));
  const dominantDelta = Math.max(deltaX, deltaY);
  return (
    (event.deltaMode ?? DOM_DELTA_PIXEL) === DOM_DELTA_PIXEL &&
    (deltaX > 0 || dominantDelta < TRACKPAD_WHEEL_DELTA_THRESHOLD)
  );
}

function normalizeWheelDelta(delta: number, deltaMode: number | undefined): number {
  switch (deltaMode) {
    case DOM_DELTA_LINE: {
      return delta * LINE_DELTA_PIXELS;
    }
    case DOM_DELTA_PAGE: {
      return delta * PAGE_DELTA_PIXELS;
    }
    default: {
      return delta;
    }
  }
}

function sameSelection(left: ViewportSelection | null, right: ViewportSelection | null): boolean {
  return left?.kind === right?.kind && left?.index === right?.index;
}

function resolveSelectionColor(
  selected: ViewportSelection | null,
  hovered: ViewportSelection | null,
  kind: ViewportSelection['kind'],
  selectedColor: number,
  hoveredColor: number,
  baseColor: number,
): number {
  if (selected?.kind === kind) {
    return selectedColor;
  }
  if (hovered?.kind === kind) {
    return hoveredColor;
  }
  return baseColor;
}

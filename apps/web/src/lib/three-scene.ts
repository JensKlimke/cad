/**
 * Pure three.js scene builder.
 *
 * Takes a `TessellationResult` and a target `<canvas>` and returns a set of
 * handles the caller uses to drive the render loop and release GPU
 * resources on unmount. Intentionally stateless — no React, no workers,
 * no globals — so the caller (Viewport.tsx) owns the lifecycle and the
 * builder stays testable in isolation.
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import type { TessellationResult } from '@cad/kernel';

export interface SceneHandles {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly mesh: Mesh;
  /** Release all GPU resources. Idempotent. */
  readonly dispose: () => void;
}

const BACKGROUND_HEX = 0x0b_0d_12;
const MESH_COLOR_HEX = 0x44_aa_ee;
const CAMERA_FOV_DEG = 45;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 1000;
const AMBIENT_INTENSITY = 0.3;
const DIRECTIONAL_INTENSITY = 0.8;

/**
 * Build a scene that renders `tessellation` to `canvas`. The caller is
 * responsible for starting the render loop (via `requestAnimationFrame`)
 * and calling `dispose()` on teardown.
 */
export function createScene(
  canvas: HTMLCanvasElement,
  tessellation: TessellationResult,
): SceneHandles {
  const scene = new Scene();
  scene.background = new Color(BACKGROUND_HEX);

  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const camera = new PerspectiveCamera(CAMERA_FOV_DEG, aspect, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(60, 40, 60);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(globalThis.devicePixelRatio ?? 1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(tessellation.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(tessellation.normals, 3));
  geometry.setIndex(new BufferAttribute(tessellation.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new MeshStandardMaterial({
    color: MESH_COLOR_HEX,
    metalness: 0.1,
    roughness: 0.4,
  });

  const mesh = new Mesh(geometry, material);

  // Center the mesh on the origin so the rotation looks natural regardless
  // of the kernel's bbox offset.
  const center = new Vector3();
  geometry.boundingBox?.getCenter(center);
  mesh.position.sub(center);
  scene.add(mesh);

  const ambient = new AmbientLight(0xff_ff_ff, AMBIENT_INTENSITY);
  scene.add(ambient);
  const directional = new DirectionalLight(0xff_ff_ff, DIRECTIONAL_INTENSITY);
  directional.position.set(100, 200, 150);
  scene.add(directional);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };

  return { scene, camera, renderer, mesh, dispose };
}

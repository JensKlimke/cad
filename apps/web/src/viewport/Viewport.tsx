/**
 * Full-viewport 3D canvas that drives the kernel worker + three.js render
 * loop. The root `<div>` exposes `data-tessellation-hash` — Playwright
 * (W12) asserts that attribute equals the committed snapshot from
 * `packages/kernel/test/__snapshots__/tessellate.int.test.ts.snap`, which
 * is how Slice 0 proves end-to-end determinism from kernel to pixels.
 */

import { useT } from '@cad/i18n';
import { useEffect, useRef } from 'react';

import { createScene, type SceneHandles } from '../lib/three-scene.js';

import { useKernelWorker } from './useKernelWorker.js';

import type { BoxInput } from '@cad/kernel';

const VIEWPORT_STYLE = {
  width: '100vw',
  height: '100vh',
  position: 'relative',
  background: '#0b0d12',
} as const;

const CANVAS_STYLE = {
  width: '100%',
  height: '100%',
  display: 'block',
} as const;

const OVERLAY_STYLE = {
  position: 'absolute',
  top: 16,
  left: 16,
  padding: '8px 12px',
  borderRadius: 6,
  background: 'rgba(0, 0, 0, 0.55)',
  color: '#e6e8ec',
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  pointerEvents: 'none',
} as const;

const ERROR_STYLE = {
  ...OVERLAY_STYLE,
  color: '#ff6b6b',
} as const;

export interface ViewportProps {
  readonly box: BoxInput;
}

export function Viewport({ box }: ViewportProps): React.JSX.Element {
  const { t } = useT('viewport');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handlesRef = useRef<SceneHandles | null>(null);
  const rafRef = useRef<number | null>(null);

  const { result, error, pending } = useKernelWorker(box);

  // Spin up or tear down the three.js scene whenever a new tessellation
  // arrives. StrictMode-safe: the cleanup releases GPU resources before a
  // double-invocation re-runs the effect.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;

    const handles = createScene(canvas, result);
    handlesRef.current = handles;

    const animate = (): void => {
      handles.mesh.rotation.x += 0.005;
      handles.mesh.rotation.y += 0.01;
      handles.renderer.render(handles.scene, handles.camera);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      handles.dispose();
      handlesRef.current = null;
    };
  }, [result]);

  return (
    <div data-tessellation-hash={result?.metadata.hash ?? ''} style={VIEWPORT_STYLE}>
      <canvas ref={canvasRef} style={CANVAS_STYLE} />
      {pending && !error && <div style={OVERLAY_STYLE}>{t('kernel.booting')}</div>}
      {error && <div style={ERROR_STYLE}>{t('kernel.error', { message: error })}</div>}
      {result && (
        <div style={OVERLAY_STYLE}>
          {t('mesh.summary', {
            triangles: result.metadata.triangleCount,
            hashPrefix: result.metadata.hash.slice(0, 12),
          })}
        </div>
      )}
    </div>
  );
}

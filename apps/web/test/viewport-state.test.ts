import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIEWPORT_SETTINGS,
  buildNamedViewCameraState,
  normalizeViewportSettings,
} from '../src/viewport/state.js';

describe('viewport state helpers', () => {
  it('builds stable named view camera presets', () => {
    const front = buildNamedViewCameraState('front');
    const top = buildNamedViewCameraState('top');
    const right = buildNamedViewCameraState('right');

    expect(front.yaw).toBe(0);
    expect(front.pitch).toBe(0);
    expect(top.pitch).toBeGreaterThan(1.5);
    expect(right.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('normalizes invalid persisted settings back to safe defaults', () => {
    const normalized = normalizeViewportSettings({
      projection: 'invalid' as never,
      visualStyle: 'broken' as never,
      selectionFilter: 'wrong' as never,
      namedView: 'unknown' as never,
      camera: {
        yaw: Number.NaN,
        pitch: 0.2,
        distance: 40,
        zoom: 1.2,
        target: [0, 'bad', 2] as never,
      },
    });

    expect(normalized.projection).toBe(DEFAULT_VIEWPORT_SETTINGS.projection);
    expect(normalized.visualStyle).toBe(DEFAULT_VIEWPORT_SETTINGS.visualStyle);
    expect(normalized.selectionFilter).toBe(DEFAULT_VIEWPORT_SETTINGS.selectionFilter);
    expect(normalized.namedView).toBe(DEFAULT_VIEWPORT_SETTINGS.namedView);
    expect(normalized.camera.pitch).toBe(0.2);
    expect(normalized.camera.distance).toBe(40);
    expect(normalized.camera.zoom).toBe(1.2);
    expect(normalized.camera.target).toEqual([0, 0, 0]);
  });
});

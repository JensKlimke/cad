import { describe, expect, it } from 'vitest';

import { isTrackpadWheelEvent, resolveWheelIntent } from '../src/lib/three-scene.js';

describe('viewport wheel intent', () => {
  it('treats ctrl-modified wheel input as pinch zoom', () => {
    expect(
      resolveWheelIntent({
        deltaY: -3.5,
        deltaMode: 0,
        ctrlKey: true,
      }),
    ).toBe('zoom');
  });

  it('treats small pixel deltas as trackpad pan by default', () => {
    const event = {
      deltaX: 9,
      deltaY: 14,
      deltaMode: 0,
    } as const;

    expect(isTrackpadWheelEvent(event)).toBe(true);
    expect(resolveWheelIntent(event)).toBe('pan');
  });

  it('treats shifted trackpad drags as orbit gestures', () => {
    expect(
      resolveWheelIntent({
        deltaY: -18,
        deltaMode: 0,
        shiftKey: true,
      }),
    ).toBe('orbit');
  });

  it('keeps traditional mouse-wheel input mapped to zoom', () => {
    const event = {
      deltaY: 3,
      deltaMode: 1,
    } as const;

    expect(isTrackpadWheelEvent(event)).toBe(false);
    expect(resolveWheelIntent(event)).toBe('zoom');
  });
});

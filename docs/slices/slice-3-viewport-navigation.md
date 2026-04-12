# Slice 3 — Viewport v1 & Trackpad Navigation

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 3.

## Goal

A professional 3D viewport a real CAD user would not laugh at: trackpad-first navigation, perspective / orthographic / isometric modes, saved named views, face/edge/vertex selection with hover highlight, and a clean WebSocket pipe from the runtime so changes to the document show up in under 100 ms.

## Definition of Done

- Open a document, pan / zoom / orbit with trackpad or mouse
- Toggle perspective ↔ ortho ↔ isometric; named views (front, top, right, iso) snap cleanly
- Hover highlights face/edge/vertex based on selection filter; click picks and shows identity in the status bar
- Visual styles: shaded, shaded+edges, wireframe
- Runtime re-build events land on the viewport over a WebSocket; viewport refreshes without reloading
- Trackpad behaves idiomatically on macOS and Windows/Linux (no drift, no inversion surprises)
- No GPU leaks across mount/unmount cycles (verified in component test)

## Out of Scope

- Feature tree, parameter inspector, Monaco → Slice 4
- Sketch mode → Slice 5
- Measurement tool, section views, clip planes (deferred to later polish pass)
- Mobile/touch support (tablet-responsive styling lands in Slice 11)

## Dependencies

Slices 0, 1, 2.

## Work Items (high-level)

- **W1** Three.js scene management service in `apps/web`: render loop, resize handling, DPR scaling, tone mapping, dispose-on-unmount discipline
- **W2** Camera controller with pluggable profiles: `trackpad-mac`, `trackpad-win`, `mouse-cad`, `mouse-onshape`; two-finger pan, pinch zoom, option-drag orbit; detents for orbit
- **W3** Perspective / ortho / iso modes; named-view preset store; animated transitions
- **W4** Tessellation → `BufferGeometry` adapter (already prototyped in Slice 0; formalized here)
- **W5** Visual-style pipeline: shaded (PBR-ish), shaded+edges (silhouette post-pass), wireframe
- **W6** Selection system: per-primitive color-id GPU picking target; hover vs click; selection-filter toggle (face/edge/vertex)
- **W7** Zustand store for viewport state: camera, selection, style, filters; persisted per-document (localStorage)
- **W8** WebSocket client in `apps/web` subscribing to `document:{id}:build` events emitted by the server; runtime pushes tessellation artifact URL; viewport refetches
- **W9** Status bar showing camera mode, selection summary, last build time
- **W10** Component tests covering camera math, picking selection, GPU cleanup
- **W11** `docs/verification/slice-3.md` manual checklist: macOS trackpad, Windows trackpad, Magic Mouse, regular mouse

## Key Decisions

| Concern           | Choice                                            | Reason                                                         |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Three.js wrapper  | Raw three.js                                      | PLAN.md commitment; R3F adds abstraction cost we don't need    |
| Camera controller | Custom (no OrbitControls)                         | OrbitControls isn't trackpad-native; we need profile switching |
| Picking           | GPU color-id (second render target)               | Reliable across complex geometry; scales to big scenes         |
| Viewport state    | Zustand with per-document persistence             | Matches PLAN.md; localStorage for now, server-synced later     |
| Transport         | WebSocket with reconnection + exponential backoff | Low-latency runtime updates; REST fallback for cold loads      |

## Testing Strategy

- **Unit**: camera math (orbit, pan, zoom), named-view snapping, style registry
- **Integration**: tessellation → BufferGeometry diffing; selection identity resolver
- **Component**: viewport controls (view picker, style picker, filter toggles); GPU cleanup in React strict mode
- **API e2e**: WebSocket event contract (subscribe, build, receive, unsubscribe)
- **Playwright**: extend existing journey to pan/orbit and assert `data-camera-mode` attribute; no new golden journey

## Risks

| Risk                              | Likelihood | Impact | Mitigation                                                                         |
| --------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------- |
| Trackpad parity across OS vendors | High       | Med    | Profile registry + manual matrix in verification checklist                         |
| GPU picking perf on big models    | Med        | Med    | Offscreen render target at ½ resolution; fallback to raycaster if picking too slow |
| WebSocket flakiness in dev        | Med        | Low    | Reconnect with backoff; status indicator; cold-load REST fallback                  |
| Three.js leaks across HMR         | High       | Med    | Strict dispose contracts; component test asserts 0 live GPU objects after unmount  |

## Exit Criteria → Gate into Slice 4

- DoD met, CI green on `main`
- Trackpad verification matrix complete on at least macOS + Windows
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

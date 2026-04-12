# Slice 5 — Sketch Subsystem v1

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 5.

## Goal

Draw a 2D sketch on a plane with constraints — end to end, inside the dual-write model from Slice 4. Integrate PlaneGCS (FreeCAD's proven solver, WASM-bound), make SVG the canonical sketch format, and wire sketch-mode transitions through the authoring layer so entering/exiting a sketch is itself a codemod that shows up in Monaco.

## Definition of Done

- Enter sketch mode on the XY datum plane, draw a fully-constrained rectangle, exit cleanly
- Solver runs on every edit; over/under-constrained primitives highlighted with colour + status message
- Sketch persisted in `document.ts` as a `sketch({ plane, svg, constraints })` call; Monaco reflects it live
- Sketch ↔ SVG round-trip is lossless (parse + print produces identical DOM)
- Parametric dimensions bind to document parameters through `@cad/expr`
- Playwright golden journey #4 (constraint failure UX) green

## Out of Scope

- Pad / 3D features → Slice 6
- SVG import with measure/scale → Slice 9
- Advanced primitives (spline handles, offset curves, construction geometry) beyond the v1 set
- Sketch on a non-planar face (Slice 7 reference hardening lands first)

## Dependencies

Slices 0, 1, 2, 3, 4, 4b.

## Work Items (high-level)

- **W1** `@cad/sketch` package: PlaneGCS WASM binding via `@salusoft89/planegcs`; memoized init
- **W2** Sketch AST: primitives (line, arc, circle, ellipse, spline, rectangle, polygon), constraints (coincident, parallel, perpendicular, tangent, equal, h/v, distance, angle, radius, symmetric), dimensions
- **W3** Sketch AST ↔ SVG serializer: canonical namespace, stable attribute ordering, constraint metadata stored in `data-cad-*` attributes; round-trip test corpus
- **W4** Sketch-mode UI in the viewport: plane-aligned 2D overlay, tool palette (primitive + constraint tools), solver status indicator
- **W5** Live solver loop: each edit → solver call → diff primitives → repaint; timeout budget with fallback to last-good state
- **W6** Over/under-constrained diagnostics: colour classes (red/yellow/green) + status bar summary; detailed view in inspector
- **W7** Parametric dimensions: dimension values bound to document parameters via expressions; solver receives evaluated numbers
- **W8** Authoring codemod: `enter_sketch_mode(plane, targetFeatureId)`, `exit_sketch_mode`, `add_primitive`, `add_constraint`, etc. — every action is an `AuthoringOp`
- **W9** Monaco reflection: entering sketch mode inserts the `sketch(...)` call; exiting finalizes it; edits replace the embedded SVG string
- **W10** Handbook pages for sketch mode, every primitive, every constraint; `docMetadata` for the new SDK op
- **W11** API e2e: apply authoring ops → build → verify sketch survives round-trip
- **W12** `docs/verification/slice-5.md` checklist

## Key Decisions

| Concern           | Choice                                                           | Reason                                                 |
| ----------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Solver            | `@salusoft89/planegcs` (PlaneGCS WASM)                           | PLAN.md commitment; proven in FreeCAD                  |
| Sketch format     | SVG 1.1 with `data-cad-*` metadata                               | PLAN.md commitment; portable, diffable, human-readable |
| Coordinate system | Sketch-local (U,V); plane transform lives in the `sketch()` call | Decouples sketch math from plane math                  |
| Solver timeout    | 50 ms live / 500 ms commit                                       | Responsive during drag, thorough on commit             |
| Failure handling  | Revert to last-good + highlight offending primitives             | Users never see a broken sketch                        |

## Testing Strategy

- **Unit**: sketch AST serialization round-trip, constraint validators, primitive geometry math
- **Integration**: real PlaneGCS solving reference systems; over/under-constrained detection; parameter-bound dimensions
- **API e2e**: authoring ops for every sketch action; build with a document containing a sketch
- **Component**: sketch-mode overlay, tool palette, inspector for sketch elements
- **Playwright**: golden journey #4 — "over-constrain a sketch → red highlight → resolve → solver green"

## Risks

| Risk                                                      | Likelihood | Impact | Mitigation                                                             |
| --------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------- |
| PlaneGCS numerical instability on ill-conditioned systems | Med        | High   | Fallback to last-good; surface diagnostics; regression corpus          |
| WASM bundle size cost                                     | Med        | Med    | Load sketch WASM lazily only on sketch-mode entry                      |
| SVG round-trip loss on edge-case attributes               | High       | Med    | Strict AST → canonical serializer; round-trip test corpus              |
| Sketch-mode UX confusion (entering/exiting, nested edits) | Med        | Med    | Explicit "Sketch: rect_1 (editing)" mode banner + keyboard Esc to exit |

## Exit Criteria → Gate into Slice 6

- DoD met, CI green on `main`
- Round-trip corpus has ≥30 sketches
- Playwright golden #4 green across 50 consecutive runs
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

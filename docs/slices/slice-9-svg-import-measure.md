# Slice 9 — SVG Import & Measure

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 9.

## Goal

Bring external designs into the CAD system as real, usable sketches. Parse a dropped SVG file into a sketch AST (paths, curves, bezier approximations, groups), place it on a target plane, and offer a measure tool that lets the user click two known points, enter the real distance, and rescale the import uniformly. Closes the gap between "I have a logo I want to engrave" and "I can extrude it".

## Definition of Done

- Drag-and-drop an SVG onto the viewport; a preview appears anchored to a target plane
- Measure tool: pick two points, enter real-world distance, sketch scales uniformly
- Imported sketch persists in `document.ts` as a regular `sketch()` call with the parsed SVG embedded
- Round-trip: import → sketch → export as SVG → re-import → identical AST
- Path types supported: straight lines, arcs, cubic/quadratic beziers (approximated to arcs within a tolerance), closed + open paths
- Group structure preserved as sketch sub-layers where useful
- Handbook: "Workflows → Importing an SVG", "Reference → Supported SVG features"

## Out of Scope

- DXF / DWG import (future)
- PDF vector import (future)
- Text elements (converted to paths upstream or explicitly rejected with a clear error)
- Raster-to-vector tracing

## Dependencies

Slices 0, 1, 2, 3, 4, 4b, 5, 6, 7, 8.

## Work Items (high-level)

- **W1** `@cad/importers/svg` package: SVG parser (`svgson` or similar), path command tokenizer, coordinate transforms
- **W2** Bezier → arc approximation with configurable tolerance; falls back to polyline beyond a threshold
- **W3** Sketch-AST emitter: produce `line`, `arc`, `ellipse`, `spline` primitives from parsed SVG
- **W4** Target plane selector: user picks plane before dropping, or defaults to the active sketch plane
- **W5** Measure tool UI: two-point picker → modal with "known distance" input → uniform scale applied to the pending import
- **W6** Preview layer: show the import on the target plane before commit; user can cancel
- **W7** Commit path: emit an `import_svg(target_plane, svg_content, scale)` authoring op; sketch persists as a sketch feature
- **W8** Round-trip test corpus: ~15 SVG files spanning real logos, icons, technical drawings
- **W9** Handbook pages + `docMetadata` for the new importer op
- **W10** API e2e coverage
- **W11** `docs/verification/slice-9.md` checklist

## Key Decisions

| Concern                             | Choice                                                      | Reason                                    |
| ----------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| SVG parser                          | `svgson` (or similar)                                       | Small, DOM-free, JSON-friendly output     |
| Bezier → arc tolerance              | 1e-3 mm default, configurable                               | Good visual parity for typical logos      |
| Fallback for high-curvature beziers | Polyline with adaptive sampling                             | Graceful; never fails the import outright |
| Default target plane                | Active sketch plane, else XY                                | Predictable behaviour                     |
| Error policy                        | Reject with explicit diagnostic, never silently drop shapes | No surprise missing elements              |

## Testing Strategy

- **Unit**: path tokenizer, bezier → arc approximator, coordinate transforms
- **Integration**: parse full SVG corpus → sketch AST; round-trip AST → SVG → AST equality
- **API e2e**: `import_svg` authoring op; importing and re-building a document
- **Component**: drag-and-drop zone, measure tool modal, preview layer
- **Playwright**: no new golden journey (Slice 9 flows into the existing sketch journey from Slice 5)

## Risks

| Risk                                                 | Likelihood | Impact | Mitigation                                                                     |
| ---------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------ |
| SVG dialect variation (Illustrator, Figma, Inkscape) | High       | Med    | Corpus with files from each major tool; known-diff log where dialects disagree |
| Bezier approximation error visible on large parts    | Med        | Med    | Adaptive tolerance; user-facing scale knob                                     |
| Measure tool precision on zoomed-out views           | Med        | Med    | Snap to existing vertices when within a threshold                              |
| Text-as-path variance                                | Med        | Low    | Document as "convert to paths first"; explicit error on `<text>` tags          |

## Exit Criteria → Gate into Slice 10

- DoD met, CI green on `main`
- Round-trip corpus 100% pass
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

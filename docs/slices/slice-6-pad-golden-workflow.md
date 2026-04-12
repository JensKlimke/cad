# Slice 6 — Pad (Sketch → 3D) — Golden Workflow

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 6.

## Goal

Close the **first full advertised workflow**: sketch a 2D profile, pad it, see a 3D solid, scrub a parameter, watch it update. Ship the `pad` SDK op end-to-end — its authoring codemod, its runtime evaluator, its feature-tree rendering, its docs, and a **printable parametric mounting spacer** as the golden demo fixture.

## Definition of Done

- SDK `pad({ sketch, length, direction })` builds and returns a solid in the runtime
- Feature tree shows the sketch nested under the pad feature
- Sketch-plane reference resolves through a Handle (construction-based)
- Viewport shows the resulting solid on every parameter change
- `examples/spacer.ts` committed: parametric mounting spacer with `length`, `width`, `height`; printable as-is
- Slice 6 golden API e2e test: _create project → add document → sketch rectangle → pad → compare tessellation hash_
- Playwright golden journey #2 (core workflow) green
- STL export works on the spacer (via the generic kernel mesher; Slice 10 adds the full export pipeline)

## Out of Scope

- Revolve, sweep, loft, fillet, chamfer, boolean, patterns, mirror → Slice 8
- Reference hardening via finder queries → Slice 7
- SVG export of wireframe → Slice 10
- Direct print → Slice 10c

## Dependencies

Slices 0, 1, 2, 3, 4, 4b, 5.

## Work Items (high-level)

- **W1** SDK `pad` op: typed inputs, Zod schema, `docMetadata`, handbook page
- **W2** Runtime evaluator for `pad`: reads the referenced sketch, calls replicad `extrude()`, returns a solid; feature DAG node
- **W3** Handle type for sketch-plane reference: construction-based (`{by: 'construction', path: [sketchId]}`), will be upgraded by Slice 7
- **W4** Authoring codemod: `add_pad(sketchRef, length, direction)`; emits a `pad(...)` call under the sketch
- **W5** Feature-tree rendering: pad node shows child sketch; icon set; rename support
- **W6** Parameter inspector bindings for pad length/direction
- **W7** Viewport updates: tessellate the pad output, merge into scene, reuse the Slice 3 pipeline
- **W8** `examples/spacer.ts` committed: parameter set `length=40`, `width=20`, `height=10`; sketch rectangle; pad to height
- **W9** Slice 6 golden API e2e test: the advertised workflow exercised end-to-end through the server
- **W10** Playwright golden journey #2: sketch → pad → 3D solid visible in the viewport
- **W11** STL export via the kernel mesher (temporary, Slice 10 replaces the plumbing)
- **W12** Handbook: "Workflows → Sketch to pad" + "Features → Pad" pages
- **W13** `docs/verification/slice-6.md` checklist; includes actually printing the spacer on an FDM printer

## Key Decisions

| Concern          | Choice                                                                       | Reason                                                             |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pad termination  | Length-only in v1                                                            | Matches FreeCAD PartDesign basic pad; up-to-plane lands in Slice 8 |
| Direction        | Normal to sketch plane, signed by `direction: 'up' \| 'down' \| 'symmetric'` | Simple, unambiguous                                                |
| Plane resolution | Construction Handle                                                          | Finder upgrade lands in Slice 7 — don't pre-optimize               |
| Golden demo      | `examples/spacer.ts` — mounting spacer                                       | Printable with only sketch+pad; meaningfully parametric            |
| STL export path  | Kernel mesher direct (Slice 10 formalizes)                                   | Minimal viable export for the golden journey                       |

## Testing Strategy

- **Unit**: pad Zod validation, direction vector computation, Handle-by-construction resolution
- **Integration**: runtime builds spacer fixture; tessellation hash snapshot stable; direction cases
- **API e2e**: Slice 6 golden — create project → document → sketch → pad → compare hash → export STL
- **Component**: pad feature node; pad form in inspector
- **Playwright**: golden journey #2 (core workflow)

## Risks

| Risk                                             | Likelihood | Impact | Mitigation                                                                |
| ------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------- |
| Sketch plane handle brittleness (pre-Slice-7)    | Med        | Med    | Keep Handle simple; Slice 7 upgrades with finder without breaking the API |
| Tessellation hash churn from kernel updates      | Low        | Med    | OCCT pinned in Slice 0; snapshot update requires explicit commit          |
| STL output broken without full exporters package | Med        | Low    | Slice 6 STL path is single-file mesher; Slice 10 replaces                 |
| Playwright flake on the core journey             | Med        | High   | Deterministic hash assertion; waits on `data-tessellation-hash` attribute |

## Exit Criteria → Gate into Slice 7

- DoD met, CI green on `main`
- The spacer has been physically printed at least once
- Playwright golden journey #2 green across 50 consecutive runs
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

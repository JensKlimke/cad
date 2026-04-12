# Slice 8 — Core Feature Library

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 8.

## Goal

Ship the **critical mass of CAD features** that lets the app model a real, non-trivial part. Every op lands with its codemod, runtime evaluator, feature-tree icon, inspector form, Zod schema, docMetadata, handbook page, and a tessellation snapshot. The golden demo upgrades from Slice 6's mounting spacer to a full parametric **Raspberry Pi 4 mounting plate** — printed on a real FDM printer as acceptance evidence.

## Definition of Done

- Every op shipped: revolve, sweep, loft, fillet, chamfer, shell, draft, boolean (union/cut/intersect), linear pattern, polar pattern, mirror, datum plane, datum axis, datum point, CSYS
- Each op has: SDK surface + codemod + runtime evaluator + Zod schema + `docMetadata` + handbook page + component test + tessellation snapshot + fixture in the regression corpus
- `examples/raspberry-pi-mount.ts` committed and builds to a printable Pi 4 mount (58×49 mm hole pattern)
- Real FDM print of the Pi mount attached to the slice PR as acceptance evidence
- Handbook CI gate enforced for every op — not a single exception
- API e2e reference-model library expanded to ~20 parts including the Pi mount
- Performance: reference library builds in CI under the p95 budget from Slice 2

## Out of Scope

- Sweep variants beyond single-rail → future polish
- Fillet variable radius / face fillets → future
- Sheet metal → explicit future slice
- Multi-part assemblies → explicit later phase

## Dependencies

Slices 0–7 (Slice 7's reference resolver is heavily exercised by fillet, chamfer, and pattern ops).

## Work Items (high-level)

- **W1** Revolve op (full pipeline)
- **W2** Sweep op (single rail, profile perpendicular to rail)
- **W3** Loft op (two or more profiles)
- **W4** Fillet op (constant radius, edge-based)
- **W5** Chamfer op (equal distance)
- **W6** Shell op (inside offset, face selection)
- **W7** Draft op (face selection + angle)
- **W8** Boolean union / cut / intersect (operand Handles via Slice 7)
- **W9** Linear pattern (count, spacing, direction)
- **W10** Polar pattern (count, total angle, axis)
- **W11** Mirror (about plane)
- **W12** Datum plane / axis / point / CSYS (reference geometry that becomes Handle targets)
- **W13** Tessellation snapshot fixtures per op + regression corpus wiring
- **W14** `examples/raspberry-pi-mount.ts`: parametric Pi 4 mount with all the parameters and derived expressions from PLAN.md
- **W15** Reference library expansion (~20 parts) and API e2e coverage
- **W16** Handbook pages for every op (gate blocks PRs that skip this)
- **W17** `docs/verification/slice-8.md` checklist + physical print evidence

## Key Decisions

| Concern          | Choice                                           | Reason                                                       |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Fillet algorithm | Constant radius, edge-based, v1                  | Matches common use; variable/face fillet deferred            |
| Boolean fallback | OCCT's native booleans; no custom fallback in v1 | Production-grade kernel; accept rare failures as diagnostics |
| Pattern body     | Pattern operands preserved as child features     | Enables per-instance edits later                             |
| Datum features   | First-class features, not sketch-only            | Handles target them; matches Onshape                         |
| Per-op snapshot  | Mandatory                                        | Catches kernel-output regressions early                      |

## Testing Strategy

- **Unit**: each op's Zod validation, input shaping, Handle resolution hand-off
- **Integration**: each op evaluated by the real kernel; tessellation snapshots; regression corpus with edit-ancestor scenarios (exercises Slice 7)
- **API e2e**: build every reference-library part end-to-end through the server; assert STL/STEP round-trip parity
- **Component**: feature-tree icons, per-op inspector forms
- **Playwright**: Slice 6 journey extends to exercise fillet + pattern; no new top-level golden journey

## Risks

| Risk                                         | Likelihood | Impact | Mitigation                                                                                      |
| -------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------- |
| Boolean robustness failures on real geometry | High       | High   | Deterministic test fixtures; diagnostic output on failure; document known-bad cases in handbook |
| Fillet/chamfer edge-case explosions          | High       | Med    | Regression corpus; snapshot per-op; escalate problematic geometries to known-issues             |
| Snapshot churn blocking PRs                  | Med        | Med    | Snapshot updates are explicit, reviewed, commit-tagged                                          |
| Pi mount print quality                       | Low        | Low    | Physical print is evidence, not a gate — slice ships on digital correctness                     |

## Exit Criteria → Gate into Slice 9

- DoD met, CI green on `main`
- Pi mount printed and mounted on an actual Pi 4 in at least one photo
- Every op has a handbook page that satisfies the gate
- Reference library builds within the p95 budget
- `known-issues.md` has no new P0/P1 entries; kernel edge cases logged as P2/P3 with explicit workaround notes
- Retrospective note added

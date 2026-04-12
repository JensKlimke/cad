# Slice 10 — Export Pipeline

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 10.

## Goal

Get models out of the system in every format users actually need. STEP for round-tripping with other CAD tools, STL / 3MF / OBJ / GLTF for printing and rendering, and a hidden-line-removed **SVG wireframe** export for drafting and illustrations. Replace the Slice 6 temporary STL path with a proper `@cad/exporters` package. This slice also unlocks Slices 10b / 10c.

## Definition of Done

- `@cad/exporters` package exports STEP, STL (binary + ASCII), 3MF, OBJ, GLTF, SVG-wireframe
- STEP round-trip: export → re-import → tessellation hashes match within tolerance
- SVG wireframe includes hidden-line removal; edge classes tagged as `visible | hidden | silhouette | tangent`
- CLI `cad export --format <step|stl|3mf|obj|gltf|svg>` writes valid files to disk
- Web Export menu covers all formats with a preview-sized thumbnail where applicable
- Playwright golden journey #6 (export) green: export STEP + SVG wireframe and assert the files download
- Every exporter has a handbook page

## Out of Scope

- Bambu-compatible 3MF metadata → Slice 10b
- LAN direct print → Slice 10c
- 2D technical drafting views (dimensions, title block) → explicit future slice
- Compression (brotli/zip for web downloads) → operational concern for Slice 15

## Dependencies

Slices 0–9.

## Work Items (high-level)

- **W1** `@cad/exporters` package scaffold; shared `ExportResult` type (`{ bytes, mime, filename }`)
- **W2** STEP writer via OCCT (`STEPControl_Writer`); round-trip test corpus with Slice 8's reference library
- **W3** STL writer (binary + ASCII) via kernel mesher; accuracy configurable
- **W4** 3MF writer (baseline, no Bambu metadata yet — that's 10b)
- **W5** OBJ writer (triangles + normals + groups per body)
- **W6** GLTF writer (for web/render pipelines; glTF 2.0 binary)
- **W7** SVG-wireframe writer with hidden-line removal via OCCT's `HLRBRep_Algo`; edge classification into the four stroke classes
- **W8** CLI `cad export` subcommand with per-format flags
- **W9** Web Export menu: format picker, per-format options, download action
- **W10** Server endpoint for headless export (feeds CLI + future MCP `printer_send`)
- **W11** Handbook pages per format + "Workflows → Exporting a model"
- **W12** API e2e coverage per format (round-trip where possible)
- **W13** Playwright golden journey #6: export STEP + SVG wireframe
- **W14** `docs/verification/slice-10.md` checklist including a manual SolidWorks / Fusion STEP import test

## Key Decisions

| Concern             | Choice                                       | Reason                                           |
| ------------------- | -------------------------------------------- | ------------------------------------------------ |
| STEP writer         | OCCT's native writer                         | Industrial-grade, what we already have           |
| Hidden-line removal | OCCT's `HLRBRep_Algo`                        | Proven algorithm, already in the kernel          |
| SVG stroke classes  | `visible \| hidden \| silhouette \| tangent` | PLAN.md commitment; maps to drafting conventions |
| Mesh quality knob   | Shared linear/angular deflection setting     | Consistent across STL/3MF/OBJ/GLTF               |
| Download UX         | Direct streaming response from server        | Avoids client-side blob hacks for large files    |

## Testing Strategy

- **Unit**: each writer's byte-level output on tiny fixtures; stroke classification logic
- **Integration**: round-trip reference library through STEP export → import → tessellation hash compare
- **API e2e**: every format endpoint happy + bad-input path
- **Component**: Export menu + format options
- **Playwright**: golden journey #6 (export)

## Risks

| Risk                                                        | Likelihood | Impact | Mitigation                                                              |
| ----------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------- |
| STEP import inconsistency in other CAD tools                | Med        | High   | Manual matrix in verification checklist (SolidWorks, Fusion, FreeCAD)   |
| HLR performance on big models                               | Med        | Med    | Adjustable mesh quality; progress reporting; async on server            |
| Large download payloads                                     | Med        | Med    | Stream from server; compression handled at infra layer (Slice 15)       |
| SVG stroke classification edge cases (tangent continuities) | Med        | Low    | Visual regression snapshots; escalate contentious cases to known-issues |

## Exit Criteria → Gate into Slice 10b

- DoD met, CI green on `main`
- STEP manual matrix passes for at least two other CAD tools
- Playwright golden journey #6 green across 50 consecutive runs
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

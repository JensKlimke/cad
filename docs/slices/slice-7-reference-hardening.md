# Slice 7 — Reference System Hardening

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 7.

## Goal

Formalize stable Handles across the codebase so picks survive feature edits — the CAD equivalent of solving the topological-naming problem. Deliver the three-layer resolver (finder → construction → hash), the finder query engine on top of replicad finders, a UI picker that **records queries from user clicks**, and a repair wizard for the rare case when resolution fails.

## Definition of Done

- Every feature input that references geometry carries a `Handle` with a `Selector` chain
- Three-layer resolver runs in order: finder → construction → hash; each layer has a pass/fail outcome the UI can surface
- UI picker records a finder query every time the user clicks geometry (not just a raw index)
- Editing a prior feature preserves downstream picks across the regression corpus
- Repair wizard opens when resolution fails; offers candidate matches; user picks one; codemod updates the source
- Reference explorer: "what depends on this face?" view lights up
- Playwright golden journey #5 (reference survival) green

## Out of Scope

- Additional feature ops → Slice 8
- Finder query DSL editor for power users (future polish)
- Cross-document references (assemblies) — explicitly deferred

## Dependencies

Slices 0, 1, 2, 3, 4, 4b, 5, 6.

## Work Items (high-level)

- **W1** `@cad/references` package: formal `Handle`, `Selector`, `FinderQuery` types; Zod schemas; serialization fixtures
- **W2** Three-layer resolver: `resolveHandle(handle, model) → Result<Entity, ResolutionError>` with per-layer diagnostics
- **W3** Finder query engine on top of replicad's finder API: predicates for plane, adjacency, direction, Z-range, face area, edge length, centroid bounds
- **W4** Construction-based fallback: tracks each feature's output topology map so a pick can be addressed by `(featureId, outputPath)`
- **W5** Geometric hash fallback: centroid + normal/direction + area/length signature; quantized to beat floating-point noise
- **W6** UI picker instrumentation: every click generates a finder query from context (plane match, direction, proximity); query previewed before commit
- **W7** Reference repair wizard: shown on resolution failure; lists candidates ranked by similarity; lets user confirm; emits codemod to update the Handle
- **W8** Reference explorer panel: given a Handle, walks the DAG and shows downstream features that depend on it
- **W9** Regression corpus: ~30 fixture documents where an earlier feature is edited; the corpus verifies downstream picks stay valid
- **W10** Authoring codemods: `update_feature_input_handle`, `replace_handle_with_repair_choice`
- **W11** Handbook: "Concepts → References", "Workflows → When a pick fails", "Reference → Handle / Selector"
- **W12** Playwright golden journey #5: pick a face → edit earlier feature → downstream fillet still binds (fillet lands in Slice 8 — journey uses pad + a Slice-8-shipped fillet stub wired in)
- **W13** `docs/verification/slice-7.md` checklist

## Key Decisions

| Concern                         | Choice                              | Reason                                                                  |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| Primary selector                | Finder query                        | Fragile less, queryable, replicad's native idiom                        |
| Fallback order                  | finder → construction → hash        | Each layer is strictly less semantic; fail to the most stable available |
| Hash quantization               | 1e-6 on coordinates                 | Matches tessellation-hash discipline from Slice 0                       |
| Repair UX                       | Modal wizard with ranked candidates | User always in the loop when ambiguity matters                          |
| Cross-feature reference storage | Serialized in the feature input     | Keeps everything in the document source; no sidecar state               |

## Testing Strategy

- **Unit**: every resolver layer, finder query evaluator, geometric hash, repair ranking
- **Integration**: regression corpus — ~30 before/after documents asserting pick survival
- **API e2e**: apply authoring op → edit prior feature → downstream op still resolves via API
- **Component**: picker preview, repair wizard, reference explorer
- **Playwright**: golden journey #5 (reference survival)

## Risks

| Risk                                          | Likelihood | Impact | Mitigation                                                                |
| --------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------- |
| Finder expressiveness gaps                    | High       | High   | Grow vocabulary per-feature-need; regression corpus drives new predicates |
| Hash collisions on symmetric geometry         | Med        | High   | Include neighborhood signature (adjacent face ids) in the hash            |
| Repair UX confusion                           | Med        | Med    | Rank candidates clearly; preview highlight; test on real users            |
| Performance on large models (many references) | Low        | Med    | Memoize per-build-hash resolution results                                 |

## Exit Criteria → Gate into Slice 8

- DoD met, CI green on `main`
- Regression corpus 100% pass; every new feature in Slice 8 seeds the corpus with before/after fixtures
- Playwright golden journey #5 green across 50 consecutive runs
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

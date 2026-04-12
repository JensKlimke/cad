# Slice 4 — Dual-Write UI ↔ Code

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 4.

## Goal

The single most distinctive feature of this project: UI and code editor stay in **perfect sync** via the authoring AST. Every UI action is a codemod on the `DocumentAST` from `@cad/authoring`; every Monaco edit re-parses and patches the UI. Ship the feature tree, the parameter inspector, a fully read-write Monaco panel, and a single undo/redo stack that covers both surfaces.

## Definition of Done

- Parameter inspector edits the source through a codemod; Monaco shows the updated code instantly
- Monaco edits re-parse, diff against the previous `DocumentAST`, and patch the feature tree without a full re-render
- A single undo/redo stack rolls back changes made from either surface
- Authoring mutex prevents concurrent UI+code writes; conflicting writes are queued, not dropped
- Cursor position and scroll in Monaco survive programmatic source replacements
- Inspector expression editor evaluates live and shows unit-aware previews
- Playwright golden journey #3 (dual-write integrity) passes

## Out of Scope

- Handbook viewer and contextual `?` buttons → Slice 4b (parallel)
- Sketch mode → Slice 5
- Collaborative multi-user editing (last-write-wins per session is fine for v1)
- Per-feature diff inline in Monaco (future polish)

## Dependencies

Slices 0, 1, 2, 3.

## Work Items (high-level)

- **W1** Feature tree UI bound to `DocumentAST`: parameter group, feature list with drag-reorder, context menu, selection sync with viewport
- **W2** Parameter inspector: typed input widgets per `ParameterKind` (`number`, `integer`, `boolean`, `enum`, `string`, `expr`); unit picker; live evaluation preview via `@cad/expr`
- **W3** Monaco integration: TypeScript language service with `@cad/sdk` types loaded as ambient declarations; read-write with debounce
- **W4** Debounced parse loop: Monaco → `parse()` → diff against current AST → dispatch patch actions
- **W5** UI-action → codemod dispatcher: every action emits an `AuthoringOp` that runs through `@cad/authoring`, returns new source, replaces Monaco buffer while preserving cursor/selection
- **W6** Authoring mutex: serialized write queue; reads always observe the last-committed source
- **W7** Source-history stack: immutable snapshots; undo/redo commands exposed via UI + keyboard; survives across the Monaco/inspector boundary
- **W8** WebSocket → feature-tree sync: runtime build results annotate the tree with success/error state per feature
- **W9** Cursor & selection preservation strategy: store an anchor before replacement, map to new source via character diff, restore
- **W10** Error surface: parse errors from Monaco shown inline; runtime errors shown on the affected feature node
- **W11** Component tests for inspector widgets, feature tree, mutex queue
- **W12** API e2e for authoring ops (reused from Slice 2 + new shape tests)
- **W13** Playwright golden journey: "edit in Monaco → tree updates; edit in inspector → Monaco updates; undo → both revert"
- **W14** `docs/verification/slice-4.md` checklist

## Key Decisions

| Concern             | Choice                               | Reason                                                           |
| ------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| Code editor         | Monaco                               | Richer TS language service than CodeMirror; PLAN.md commitment   |
| Debounce            | 250 ms (Monaco edits → reparse)      | Balances latency and keystroke burn                              |
| Undo history        | Immutable snapshots of source string | Simpler than operational transforms; adequate for single-session |
| Mutex model         | Single-writer queue                  | Prevents interleaved writes; last-write-wins inside a session    |
| Cursor preservation | Anchor + minimal-diff mapping        | Feels native; survives codemods that touch unrelated regions     |

## Testing Strategy

- **Unit**: AST diffing, patch generation, mutex queue, cursor mapper
- **Integration**: full round-trip — UI action → codemod → new source → parse → patched AST equals expected
- **Component**: every inspector widget, feature tree drag-reorder, Monaco panel
- **API e2e**: authoring-op endpoints shared with Slices 12/14
- **Playwright**: golden journey #3 (dual-write integrity) added

## Risks

| Risk                                                                    | Likelihood | Impact | Mitigation                                                                           |
| ----------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------ |
| Cursor/selection jumps on programmatic replacement                      | High       | High   | Anchor + minimal-diff mapping; component test asserts cursor survives N replacements |
| Infinite reparse loops (UI edit triggers Monaco event triggers UI edit) | Med        | High   | Provenance tag on writes; skip reparse when source is identical                      |
| Monaco TS language service drags on big docs                            | Med        | Med    | Ambient type def kept small; benchmark with 1k-feature fixture                       |
| Mutex starvation under rapid-fire edits                                 | Low        | Med    | Queue depth metric; tests cover burst-write scenarios                                |

## Exit Criteria → Gate into Slice 5

- DoD met, CI green on `main`
- Playwright golden journey green across 50 consecutive runs
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

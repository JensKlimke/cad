# Slice 4b — Handbook Infrastructure

> Skeleton plan. Upgraded to Slice-0 depth when execution begins.
> Parent: [`PLAN.md`](../../PLAN.md) — Slice 4b. Delivered in parallel with Slice 4.

## Goal

Ship the handbook as a **first-class feature**, not as documentation. Build the `@cad/handbook` package, the in-app MDX viewer, the CLI `cad docs` command, and — most importantly — turn on the CI gate that will block every future PR adding a user-visible SDK op without a handbook page. The handbook must be programmatically queryable so Slice 14's MCP server can expose it to AI agents.

## Definition of Done

- `@cad/handbook` package builds an MDX content tree, validates frontmatter with Zod, and emits a MiniSearch index
- In-app handbook viewer renders MDX pages with TOC, deep links, code-copy buttons, theme-aware styling
- Every feature dialog, inspector field, and command palette entry (placeholder in Slice 4) has a `?` button that deep-links to the right handbook anchor
- CLI `cad docs`, `cad docs search <query>`, `cad docs list` render MDX in the terminal
- Programmatic API exposed: `search(query, filters)`, `get(path)`, `list()`, `forSdkOp(opId)`
- CI gate (`lint:handbook`) replaces the Slice 0 stub and fails on any SDK op without a corresponding page
- Proof-of-gate test: deliberately breaking an op in CI fails the PR
- Initial content shipped: Concepts (document model, feature DAG, references, parameters, expressions, dual-write), Workflows (create project → sketch → pad), FAQ
- **Handbook content ships in English + a German stub** so the locale-fallback path established in [Slice 0b](./slice-0b-i18n-baseline.md) is actually exercised at runtime. Layout: `packages/handbook/content/<locale>/features/<op-id>.mdx`. Missing translations fall back to the English file at lookup time (same contract as `@cad/i18n`). The `lint:handbook` gate only requires the **English** page to exist; a German translation is optional but must be valid frontmatter if present.

## Out of Scope

- MCP handbook tools → Slice 14
- Semantic search via embeddings → future (lexical MiniSearch first)
- Full content coverage across every op → lands per-slice via DoD gate
- Versioned handbook history → handbook version = SDK version for v1

## Dependencies

Slices 0, 1, 2. Delivered in parallel with Slice 4 — no Slice 4 feature blocks on Slice 4b and vice versa.

## Work Items (high-level)

- **W1** `@cad/handbook` package scaffold: **locale-partitioned** content directory (`content/en/`, `content/de/`), frontmatter Zod schema, build script
- **W2** MDX content pipeline: compile-time MDX → JSX; shared MDX component set (callouts, code blocks, cross-references)
- **W3** **Per-locale** MiniSearch index builder: tokenize title + body + tags; emit **one JSON blob per locale** (`index.en.json`, `index.de.json`) shipped with the package. Non-English indexes contain only the subset of pages that have been translated.
- **W4** Programmatic API: `search`, `get`, `list`, `forSdkOp`; **every function takes a `locale: Locale` parameter** (default `'en'`) and performs English fallback when a requested page is missing in the target locale; framework-free, runnable in Node and browser
- **W5** In-app handbook viewer in `apps/web`: MDX renderer (`@mdx-js/react`), TOC, deep links, code copy, dark/light aware. Passes the active locale (from the `@cad/i18n` context established in [Slice 0b](./slice-0b-i18n-baseline.md)) into every `search`/`get` call.
- **W6** Contextual `?` buttons wired into Slice 4's feature tree and inspector; deep link by anchor
- **W7** Command palette stub (placeholder for Slice 11) surfaces handbook hits inline; localized strings in the palette itself route through `useT('palette')` per the Slice 0b contract
- **W8** CLI `cad docs` subcommand: list, search, get; renders MDX in the terminal via a markdown-to-ANSI renderer. **English-only at this slice**, in line with the Slice 0b decision that `apps/cli` does not depend on `@cad/i18n`.
- **W9** `docMetadata` contract enforced at the SDK level: each op exports `{ id, title, shortDescription, params: ZodSchema, examples, handbookPath }`
- **W10** Codegen step: if an SDK op lacks a handbook page (in English), emit a stub MDX file (developer must fill it in). German stubs are **not** auto-generated — translators opt in by adding the file.
- **W11** Replace `scripts/lint-handbook.ts` no-op with the real gate: scan `@cad/sdk` exports, cross-reference with `content/en/**` MDX frontmatter, fail on mismatch. The gate is structurally identical to Slice 0b's `i18n:check` and runs in the same CI step position (after `typecheck`, before `test`).
- **W12** Initial content: Concepts, Workflows, FAQ; at least one op (`pad`, even if stubbed) has a real page to exercise the pipeline. One page (the FAQ) ships with a complete German translation to prove the fallback + serve path end-to-end.
- **W13** MCP handbook tools (preview — full spec in Slice 14): `handbook_search`, `handbook_get`, `handbook_for_op` **all accept an optional `locale` parameter** and default to `'en'`. This is a forward declaration in the Slice 4b programmatic API so the Slice 14 tool wrappers are thin shells.
- **W14** `docs/verification/slice-4b.md` checklist — includes a manual step to switch the UI locale to German, open the FAQ page, and confirm the German translation renders; then switch to an op page that has no German translation and confirm the English fallback renders with a visible "translated from English" note in the UI.

## Key Decisions

| Concern              | Choice                                           | Reason                                                                                                                                                                    |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content format       | MDX                                              | Mixes prose + live components; React-native                                                                                                                               |
| Search               | MiniSearch (lexical)                             | Zero runtime deps, offline-capable, fast enough                                                                                                                           |
| Semantic search      | Deferred                                         | Lexical solves 90% of discovery; semantic adds complexity                                                                                                                 |
| CLI renderer         | `marked-terminal` or similar                     | Proven, no custom rendering to maintain                                                                                                                                   |
| Gate enforcement     | Pre-build script in CI                           | Runs before `pnpm test`; fails fast                                                                                                                                       |
| **i18n integration** | **Reuses Slice 0b's `@cad/i18n` runtime**        | One locale contract across UI strings + handbook content; no second detection chain or second cookie; handbook reads the same `cad_locale` cookie as the rest of the app. |
| **Locale layout**    | **`content/<locale>/` partitioned, EN required** | Clean file-system separation; translators can add a language by creating one directory; `lint:handbook` only enforces English so missing translations don't block merges. |
| **CLI localization** | **None — English only**                          | Developer tool, matches Slice 0b's CLI-scope decision; keeps the CLI binary light and dependency-free of `@cad/i18n`.                                                     |

## Testing Strategy

- **Unit**: frontmatter validator, search index tokenizer, `forSdkOp` lookup, CLI renderer
- **Integration**: build full content tree; assert every op has a page; search returns expected hits
- **API e2e**: `GET /handbook/*` endpoints (so the web app can fetch without bundling the entire content tree)
- **Component**: MDX viewer renders headers/code/callouts correctly; deep-link resolver
- **Playwright**: no new journey yet; Slice 11 adds the "handbook access" golden journey

## Risks

| Risk                                        | Likelihood | Impact | Mitigation                                                          |
| ------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------- |
| MDX bundler integration with Vite           | Med        | Med    | Use `@mdx-js/rollup` — well-supported; pinned version               |
| Gate false positives on legacy/stub ops     | Med        | Med    | Allowlist for explicitly-stubbed ops with `docMetadata.stub: true`  |
| CLI MDX rendering fidelity                  | Low        | Low    | Limit custom MDX components; fallback to plain markdown in terminal |
| Content rot (prose drifts from op behavior) | High       | Med    | Generate param tables from the op's Zod schema at build time        |

## Exit Criteria → Gate into Slice 5

- DoD met, CI green on `main`
- Gate demonstrably fails on a deliberate missing page
- `known-issues.md` has no new P0/P1 entries
- Retrospective note added

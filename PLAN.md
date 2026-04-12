# PLAN — AI-Ready Web CAD System

## Context

Building a production-grade, high-scale, web-based parametric CAD system inspired by FreeCAD 1.0 workflows but designed to surpass it. The goal is a modern, collaborative, AI-driven CAD tool with:

- **Code-first parametric modeling** — the document IS executable TypeScript, versionable like source code
- **Stable, queryable references** — every node/edge/face/axis/datum addressable across regenerations
- **Headless-controllable** — every operation reachable via UI, CLI, REST API, MCP, and the TypeScript SDK
- **Modern web UX** — 3D viewport, feature tree, command palette, trackpad-native navigation
- **Industrial kernel** — B-rep, boolean solids, STEP I/O (not mesh hacks)

The system ships as a sequence of small, end-to-end vertical slices, each independently shippable and testable.

## Confirmed Decisions

- **Deployment**: self-hosted on-prem. Single-tenant per install. Docker Compose for dev & small deployments, optional Helm chart for larger. Auth is simple (local users + OIDC adapter for enterprise IdPs) — no multi-tenant isolation.
- **Parameters**: full expression support from day one. Parameters are typed expressions (e.g. `width = 2*height + 5`) with a dependency graph inside the document.
- **Authoring model**: **strict dual-write** — UI and code always in sync. Every UI action emits a TypeScript source edit via an AST codemod; every Monaco edit re-parses and re-renders the viewport + feature tree. This mandates an AST-backed source-mapping layer (`packages/authoring`) from Slice 2.

## Non-Goals (initial roadmap)

- Multi-tenant SaaS and hosted cloud (explicitly deferred — on-prem only)
- Assembly mates and multi-part assemblies (tracked for later)
- FEA / simulation
- 2D technical drafting / drawing output module
- Native desktop app (PWA acceptable)
- Google-Docs-style realtime multi-user (first pass = pessimistic locking)
- BambuLab **Cloud** API (third-party cloud dependency — LAN-only for v1)
- **Server-side slicing** (Phase C idea — captured but deferred; see "Deferred Ideas")

## Key Architectural Decisions

### Geometry kernel — `replicad` (wrapping OpenCascade.js WASM)

Industrial B-rep kernel — the same OCCT that powers FreeCAD — with a TypeScript API purpose-built for parametric modeling. Already solves the topological-naming problem via **finders**: edges/faces queried by geometric predicates (by plane, adjacency, direction, Z-range), not brittle indices. Runs in browser Web Workers and Node.js — same kernel on client and server.

### 2D sketch constraint solver — `@salusoft89/planegcs`

FreeCAD's PlaneGCS compiled to WASM with TypeScript bindings. Numeric solvers: DogLeg, Levenberg-Marquardt, BFGS, SQP. Proven in production.

### 3D rendering — `three.js` + OCCT tessellation

OCCT produces meshes from B-rep, fed to Three.js `BufferGeometry`. Wireframe/silhouette projection for 3D→SVG export.

### Model Runtime — TypeScript-in-a-sandbox

The document is a TS module that imports `@cad/sdk` and exports a build function. Executed in an isolated Web Worker / V8 isolate with timeout and memory cap. Deterministic: same inputs → same outputs → safe caching, diffing, AI manipulation.

### UI — React 19 + Vite + Tailwind + shadcn/ui

Mainstream, hirable, mature. Zustand for viewport/UI state, TanStack Query for server state, Monaco for the inline code editor.

### Backend — Node 22 + Fastify 5 (self-hosted)

Shares TS code with kernel/runtime. PostgreSQL 16 (projects/documents/versions/users) + S3-compatible blob store (MinIO bundled for on-prem; swappable for AWS S3, GCS, Azure). Auth: local users + optional OIDC adapter. Single-tenant per install. Shipped as a Docker Compose stack (postgres + minio + server + worker + web) with an optional Helm chart for larger on-prem deployments.

### Authoring Model — Strict Dual-Write UI ↔ Code

This is the hardest and most distinctive decision. Both surfaces read and write the **same canonical source**: the TypeScript document module.

- **Canonical source of truth**: `document.ts` — a TypeScript file that calls SDK functions (`pad`, `revolve`, `sketch`, ...).
- **Parse direction** (code → UI): the `packages/authoring` layer parses `document.ts` with the TypeScript compiler API (`ts.createSourceFile`) into a typed `DocumentAST` — a small, stable shape (`parameters[]`, `features[]`, `statements[]`) — that feeds the feature tree and parameter inspector. We do **not** re-derive the tree from execution; we derive it from the AST.
- **Write direction** (UI → code): every UI action (add feature, edit parameter, rename, reorder) is an **AST codemod**: a pure function `(ast: DocumentAST, op: AuthoringOp) => DocumentAST` plus a printer that emits formatted TypeScript (ts-morph printer, Prettier-formatted). Round-trip preserves user comments and ordering.
- **Execution**: the printed source is what the runtime executes. UI and code never disagree because they read from the same AST and the same printer emits the same text.
- **Granular updates**: Monaco edits debounce → re-parse → diff AST → patch feature tree + viewport. UI edits go through the same `(ast, op) → ast` pipeline, never bypass the AST.
- **Conflict model**: last-write-wins within a single session; Monaco is read-write only when no UI action is in flight (enforced by an authoring mutex).

### Parameter Expressions

Parameters are typed expressions with dependencies:

```ts
parameters({
  height: number(50, 'mm'),
  width: expr<number>('2*height + 5', 'mm'),
  holes: integer(4, { min: 1, max: 32 }),
});
```

- Parsed by a small expression DSL (we use `expr-eval` or a tiny hand-written Pratt parser — pinned in Slice 2)
- Dependency graph computed at parse time; topological evaluation; cycle detection with clear errors
- Units carried through expressions (`mm`, `deg`, etc.); dimensional mismatch is a type error surfaced in the inspector
- The SDK re-exports these as regular TypeScript values to the feature code, so feature bodies consume fully-evaluated numbers

### Monorepo — pnpm workspaces + Turborepo

Clean package split: kernel, sdk, runtime, authoring, server, web, cli, mcp. Pure packages have no React dependency and run in Node/Bun/edge.

## Core Concepts

### Document Model

```
Workspace
  └── Project
        └── Document  (a TypeScript module)
              ├── Parameters   (named, typed, unit-carrying inputs)
              ├── Bodies       (top-level solid results)
              ├── Sketches     (SVG + PlaneGCS constraint state)
              └── Features     (DAG of operations: pad, revolve, fillet, ...)
```

### Parametric Graph

Features form a **DAG**, not just a list. Each feature:

```ts
interface Feature<I, O> {
  id: string; // stable across edits
  kind: string; // 'pad' | 'revolve' | ...
  inputs: I; // includes Handles to prior features
  userLabel?: string;
  evaluate(ctx: EvalContext, inputs: I): Promise<O>;
  dependencies(inputs: I): Handle[];
}
```

Re-evaluation is topological with memoization; unchanged subtrees reuse cached artifacts keyed by input hash.

### Reference System — "Stable Handles"

Every addressable entity has a **Handle** that survives regeneration:

```ts
type Handle =
  | { kind: 'feature'; featureId: string }
  | { kind: 'parameter'; name: string }
  | { kind: 'face' | 'edge' | 'vertex'; owner: FeatureId; selector: Selector };

type Selector =
  | { by: 'finder'; query: FinderQuery } // primary: geometric predicate
  | { by: 'construction'; path: string[] } // fallback: "created by feature X step Y"
  | { by: 'hash'; value: string }; // last resort: geometric signature
```

Three-layer resolution chain (fail-safe):

1. **Finder** — e.g., "face whose normal is +Z and centroid z > 10"
2. **Construction history** — "introduced by feature 4, child 2"
3. **Geometric hash** — centroid + normal + area signature

This matches FreeCAD 1.0's approach but formalized in core data from day one, and the finder primary is how `replicad` avoids toponaming altogether in the happy path.

## System Architecture

```
packages/
  kernel/      # OCCT/replicad WASM wrapper; Node + browser
  sdk/         # Public TS API — what user's document.ts imports
  authoring/   # TS-AST parser + codemods + printer (dual-write core)
  expr/        # Parameter expression parser, units, dependency graph
  runtime/     # Sandboxed document executor, DAG scheduler, cache
  geometry/    # Shared math: vec3, mat4, plane, transforms, hashing
  sketch/      # PlaneGCS integration; SVG ↔ sketch AST
  references/  # Handle/Selector resolver + finder query engine
  handbook/    # MDX content + search index + programmatic query API
  exporters/   # STEP, STL, 3MF, OBJ, GLTF, SVG wireframe
  importers/   # SVG (measure/scale), STEP, STL
  printers/    # Pluggable printer provider interface + BambuLab LAN provider
  protocol/    # Zod schemas for API/CLI/MCP — single source of truth
apps/
  web/         # React editor: viewport, sketcher, feature tree, cmd palette, Monaco
  server/      # Fastify REST + WebSocket
  cli/         # `cad` command
  mcp/         # MCP server exposing tools to AI clients
deploy/
  compose/     # docker-compose.yml for on-prem dev & small deployments
  helm/        # Helm chart for larger on-prem deployments
```

All four control surfaces (UI, CLI, REST, MCP) are thin wrappers over `runtime` + `protocol`. Each action is defined **once** as a Zod-validated command and reused everywhere. No drift between interfaces.

## Feature List — First Professional Shot

### A. Document & Project Management

- A1 Project CRUD
- A2 Document CRUD inside project
- A3 Typed document parameters (numbers with units, enums, booleans, strings, expressions)
- A4 Revision history (commit-based; diff/restore)
- A5 Document template library

### B. Sketch Subsystem (SVG-based, PlaneGCS-solved)

- B1 Enter sketch mode on datum plane or planar face
- B2 Primitives: line, arc, circle, ellipse, spline, rectangle, polygon
- B3 Constraints: coincident, parallel, perpendicular, tangent, equal, horizontal/vertical, distance, angle, radius, symmetric
- B4 SVG import with measure/scale tool
- B5 SVG export of active sketch
- B6 Lossless sketch ↔ SVG round-trip
- B7 Parametric dimensions bound to document parameters
- B8 Over/under-constrained diagnostics with visual highlighting

### C. 3D Feature Modeling

- C1 Pad (extrude) / Pocket
- C2 Revolve
- C3 Sweep / Loft
- C4 Fillet / Chamfer
- C5 Shell / Draft
- C6 Boolean: union, cut, intersect
- C7 Linear / polar pattern
- C8 Mirror
- C9 Reference geometry: datum plane, axis, point, CSYS
- C10 Multi-body documents

### D. Viewport & Navigation

- D1 Perspective / orthographic / isometric
- D2 Named views (front, top, right, iso, saved custom)
- D3 Trackpad-first navigation (two-finger pan, pinch zoom, option-drag orbit)
- D4 Mouse profiles (CAD / Onshape / SolidWorks / SpaceMouse)
- D5 Selection: hover highlight, click pick, marquee, filter by face/edge/vertex
- D6 Section views, clip planes
- D7 Visual styles: shaded, shaded+edges, wireframe, x-ray
- D8 Measurement tool (distance, angle, radius)

### E. Import / Export

- E1 SVG import (measure/scale)
- E2 STEP import & export (via OCCT)
- E3 STL export (binary + ASCII)
- E4 3MF export (3D printers)
- E5 OBJ / GLTF export
- E6 SVG wireframe export (3D→SVG, hidden-line removal, stroke classes per edge type: visible / hidden / silhouette / tangent)
- E7 Server-side thumbnail generation

### F. Reference & Selection System

- F1 Stable Handles embedded in every feature input
- F2 Finder query UI (visual: user clicks a face → system generates predicate)
- F3 Reference repair wizard when resolution fails
- F4 Reference explorer: "what depends on this face?"

### G. API / CLI / MCP / Code

- G1 `@cad/sdk` TypeScript SDK — primary authoring interface
- G2 REST API (OpenAPI, generated from Zod)
- G3 WebSocket channel for live doc updates & render streaming
- G4 `cad` CLI: `init`, `build`, `export`, `params`, `run`, `diff`
- G5 MCP server: tool-per-operation, resource-per-document
- G6 Headless renderer (PNG/SVG/thumbnail from CLI or API)

### H. UI/UX Shell

- H1 Modern layout: feature tree sidebar, command bar, bottom status, right inspector, center viewport
- H2 Command palette (Cmd+K) — every action searchable
- H3 Keyboard shortcut registry (Onshape-compatible defaults, remappable)
- H4 Undo/redo tied to feature DAG (not just input buffer)
- H5 Dark/light theme, tablet-responsive
- H6 Inline Monaco editor showing live `document.ts`

### J. Handbook & In-App Guidance (first-class feature)

The handbook is a **feature**, not docs — it has its own package, is shipped with every install, and is queryable by humans and by the MCP server.

- J1 `packages/handbook` — MDX content + frontmatter (`id`, `title`, `kind`, `related`, `tags`, `sdk_ops`, `since`) + build-time search index
- J2 Content kinds: **Concepts**, **Workflows**, **Features** (one per SDK op), **SDK reference**, **CLI reference**, **MCP reference**, **FAQ**, **Examples**
- J3 Feature pages are **generated from a single source of truth**: each SDK op exports a `docMetadata` object with Zod-described parameters, examples, and prose; the handbook build merges metadata with hand-written narrative so the API and its docs never drift
- J4 **In-app handbook viewer** — MDX renderer with a TOC, deep-linkable anchors, copy-code buttons, live parameter previews
- J5 **Contextual help everywhere** — every feature dialog, command palette entry, and inspector field has a `?` that deep-links to the right handbook anchor
- J6 **Command palette integration** — Cmd+K also searches the handbook inline; hitting return on a handbook hit opens the doc without leaving flow
- J7 **Search** — lexical via MiniSearch (zero runtime deps, fast, offline-capable); optional semantic later via `transformers.js` + MiniLM
- J8 **Programmatic API**: `handbook.search(query, { kind?, tags?, limit? })`, `handbook.get(path)`, `handbook.listTopics()`, `handbook.forSdkOp(opId)`
- J9 **CLI**: `cad docs <topic>`, `cad docs search <query>`, `cad docs list` — renders MDX in terminal (markdown-render)
- J10 **MCP tools** (exposed in Slice 14): `handbook_search`, `handbook_get`, `handbook_list`, `handbook_for_op` — so an AI agent can look up how to do something _before_ issuing an authoring op
- J11 **Slice DoD gate**: from Slice 5 onward, every slice that ships a user-visible feature **must** land handbook entries in the same PR. Enforced by a CI check that fails if new SDK ops lack corresponding handbook pages.
- J12 **Versioning**: handbook is versioned with the SDK; `since` frontmatter drives "new in vX" badges

### K. Printer Integration (BambuLab first, pluggable)

Ship parts directly from the CAD app to a real 3D printer. BambuLab is the first provider; the architecture is a **pluggable provider interface** so Prusa Connect, Klipper/Moonraker, and OctoPrint can follow later without touching the rest of the codebase.

- K1 `packages/printers` — provider-agnostic core: `PrinterProvider` interface (`connect`, `status`, `uploadFile`, `startPrint`, `pausePrint`, `resumePrint`, `cancelPrint`, `listFiles`, `onStatusChange`), printer registry, encrypted credential store
- K2 **Phase A — Bambu-compatible 3MF handoff** (Slice 10b): extend the Slice 10 3MF exporter to write BambuStudio's metadata extensions (thumbnails, plate dimensions, recommended filament, slicer hints), so a double-click opens cleanly in Bambu Studio; "Download for Bambu Studio" action in the Export menu
- K3 **Phase B — LAN direct print** (Slice 10c): BambuLab provider implementing the LAN MQTT + FTP protocol (using the `mqtt` and `basic-ftp` npm packages; reference protocol from Doridian's `OpenBambuAPI` docs); supports X1/X1C, P1P/P1S, A1/A1 Mini (any BambuLab model with LAN-mode Developer Mode)
- K4 **Printers page** in UI — add/edit/remove printers (host/IP, serial, access code), test connection button, per-printer live status card (bed temp, nozzle temp, job progress, camera thumbnail if available)
- K5 **Per-document "Send to Printer" action** — picks from registered printers, uploads 3MF via FTP, starts print via MQTT, streams live status back to the UI over WebSocket
- K6 **Security**: all printer credentials stored encrypted at rest in Postgres with a per-install KMS key; the MQTT connection lives on the server side (never in the browser) so access codes never reach the client; audit log of every print command
- K7 **Extensibility**: provider interface is the public contract; each new provider is a standalone package following the `packages/printers/providers/<name>` pattern
- K8 **MCP tools** (exposed in Slice 14): `printer_list`, `printer_status`, `printer_send`, `printer_cancel` — so an AI can trigger a print, monitor progress, and cancel if something goes wrong
- K9 **Handbook**: dedicated "Printing" section — setup guide (enabling Developer Mode, finding access code + serial), per-model guidance, troubleshooting, safety caveats
- K10 **Testing**: mock provider that records operations for unit/integration tests; real-printer smoke-test flag (`PRINTER_SMOKE=bambu_x1c`) gated off by default in CI; manual verification checklist for each supported model

### L. Internationalization (i18n / multi-language)

Every user-visible string in the product is translatable from day one. Infrastructure lands in **Slice 0b** — before Slice 1 writes its first login-form string — so the "translate it later" tech debt never accumulates. `apps/cli` is the sole exception (developer tool, English-only).

- L1 `packages/i18n` — shared `react-i18next` + `i18next` runtime; factory for request-scoped server instances and a React context + typed `useT(namespace)` hook for the web.
- L2 **Launch locales**: English (source) + German (first translation). Adding a third language is a single-file change — one entry in `locales.ts` plus one catalog directory.
- L3 **JSON namespace catalogs** at `packages/i18n/locales/<lang>/<ns>.json`; industry-standard format consumed by Crowdin / Lokalise / Transifex / Weblate without pre-processing.
- L4 **`apps/web` every user-visible string** routes through the typed `useT(namespace)` hook. **No locale in the URL** — the active locale lives in a readable `cad_locale` cookie (`SameSite=Lax`, 1 year) mirrored into `localStorage` for cross-tab sync. Detection chain: cookie → localStorage → authenticated user preference (Slice 1+) → `Accept-Language` / `navigator.language` → `en` fallback. Language switcher surfaces in the top bar from Slice 11 (hidden behind a feature flag until then).
- L5 **`apps/server` error envelopes** grow an optional `i18nKey` field on `@cad/protocol` `ErrorEnvelopeSchema`; the web client re-translates with its active locale. Server reads `cad_locale` cookie first (authoritative, matches the client) with `Accept-Language` as a fallback for non-web callers; attaches a request-scoped `request.t` for any server-side HTML responses (Slice 12 OIDC pages, email templates).
- L6 **CI gate `i18n:check`** runs `i18next-parser` in check mode on every PR — fails the build if any source file uses a translation key missing from the `en` catalog. Mirrors the handbook CI gate from Slice 4b.
- L7 **Playwright**: the Slice 0 `box-renders` golden journey (and, from Slice 1, the `lifecycle` journey) runs once per supported locale — confirms the full kernel → worker → three.js → translated viewport chain renders in both `en` and `de`. Budget impact: +1 test slot, still within the ≤10-test / ≤3-min Playwright budget.
- L8 **Handbook i18n** (Slice 4b) reuses the same `@cad/i18n` runtime and catalog format; MDX content lives in `packages/handbook/content/<lang>/features/*.mdx` with a parallel per-language structure. Missing translations fall back to English.
- L9 **CLI scope**: `apps/cli` stays English-only. Developer tool, no localized strings, no dependency on `@cad/i18n`. Documented in `docs/slices/slice-0b-i18n-baseline.md`.
- L10 **MCP tools** (Slice 14) honour a `locale` parameter on every tool response that contains human-readable prose, defaulting to `en`. Handbook-query tools (`handbook_search`, `handbook_get`, `handbook_for_op`) route through `@cad/i18n` to return locale-appropriate content.
- L11 **Slice DoD gate**: from Slice 0b onward, every slice that ships a user-visible string **must** route it through `@cad/i18n`. Enforced by the `i18n:check` CI gate — landing a new string without a catalog entry blocks the merge.

### I. Persistence & Platform

- I1 PostgreSQL schema (workspaces, projects, documents, versions, parameters, users)
- I2 Blob store for kernel artifacts & thumbnails
- I3 OIDC auth
- I4 Multi-tenant workspace model
- I5 Kernel worker pool with resource limits
- I6 OpenTelemetry traces, Prometheus metrics, pino structured logs
- I7 CI/CD: GitHub Actions, lint/test/e2e per PR, reference-model snapshot suite

## Delivery Slices — Small, Vertical, End-to-End

Each slice ends with something demonstrable. Each has automated tests and a manual verification checklist.

### "See and experience" milestones

Quick reference for when a human can open something and feel progress:

- **Slice 0** — rotating box in the browser (first pixel on screen)
- **Slice 0b** — same box, overlays translate (`cad_locale=de` → "Kernel wird geladen…")
- **Slice 1** — `docker compose up`, log in, create a project, see it persist after refresh
- **Slice 3** — open a document and pan/zoom/orbit/pick with a trackpad
- **Slice 4** — scrub a parameter in the inspector _or_ Monaco; both stay in sync
- **Slice 5** — draw a constrained rectangle in sketch mode; Monaco updates itself
- **Slice 6** — open `examples/spacer.ts`, scrub parameters, export STL, physically 3D-print the part (the full advertised workflow)

### Slice 0 — Foundations

Monorepo skeleton, CI, kernel-in-worker proof, **and the full testing pyramid scaffold**.

- pnpm workspace + Turborepo + shared TS config + ESLint/Prettier
- `packages/kernel` loads replicad WASM in Node and browser worker
- Smoke test: create a box, tessellate, return triangles
- `apps/web` Vite shell renders that box in three.js
- `apps/cli` prints package versions
- **Testing scaffold**:
  - Vitest shared config + coverage thresholds per package
  - Testcontainers wiring (Postgres + MinIO) in `tests/containers`
  - Supertest harness for API e2e (stub app at Slice 0)
  - Playwright config + single golden journey ("app loads, box visible") to prove the pipeline
  - Stryker config (weekly job) for mutation testing on core packages
  - Handbook lint stub (`lint:handbook` command, no-op at Slice 0)
- GitHub Actions matrix: typecheck, unit, integration, API e2e, Playwright, coverage gate
  **Ships**: Box in browser + CLI scaffold + green testing pipeline at every layer, proving every layer runs in CI before we build on top of it.

### Slice 0b — Internationalization Baseline

Lands the `@cad/i18n` workspace package, wires `apps/web` through `react-i18next`, migrates the Slice 0 viewport overlays to translated strings, ships English + German source catalogs for three namespaces (`common`, `errors`, `viewport`), and adds the `i18n:check` CI gate. Every subsequent slice writes user-visible strings through the typed `useT(namespace)` hook from day one — the login form in Slice 1 is the first consumer.

- **`packages/i18n`** — shared `i18next` runtime, `declare module 'i18next'` type augmentation, locale registry (`Locale = 'en' | 'de'`), ICU formatters, typed React hook wrapper (`useT`), `<I18nProvider>` component, `createBrowserI18n()` + `createServerI18n()` factories
- **Launch catalogs** — `en` (source) + `de` (first translation) for `common`, `errors`, and `viewport` namespaces; every German string is a real translation, not a placeholder, so the fallback path is actively exercised
- **`apps/web` wiring** — `<I18nProvider>` wraps the root, `cad_locale` cookie + `localStorage` detection chain, hidden language switcher component behind a feature flag (surfaces in Slice 11)
- **Slice 0 migration** — `Viewport.tsx` overlays (`"Booting kernel…"`, `"Kernel error:"`) move into the `viewport` namespace; snapshot assertions accept any supported locale
- **CI gate** — `pnpm i18n:check` runs `i18next-parser` in check mode; fails the build on any untranslated source string. New CI job wired into `.github/workflows/ci.yml`
- **Server hook (stub for Slice 1)** — `packages/i18n` exports `createServerI18n()` factory that Slice 1's Fastify bootstrap immediately consumes via an onRequest hook that reads `cad_locale` cookie first and `Accept-Language` second, then attaches `request.t` for route handlers
- **Playwright** — the Slice 0 `box-renders` golden journey is parameterized on locale; runs once per supported locale, asserts both the deterministic tessellation hash (unchanged) and the translated overlay label
  **Ships**: launching `apps/web` with `cad_locale=de` renders "Kernel wird geladen…" instead of "Booting kernel…"; the committed tessellation hash is unchanged in both locales; Playwright proves both; `pnpm i18n:check` is green; Slice 1 inherits the contract without any retrofit.

### Slice 1 — Project & Document Lifecycle (on-prem baseline)

Persist a project and re-open it.

- Docker Compose: postgres + minio + server (`deploy/compose/docker-compose.yml`)
- PostgreSQL schema: workspace/project/document/version (single tenant)
- Fastify REST: create/list/get project & document
- Local-user auth: username + password, JWT session, seeded admin on first boot; pluggable OIDC adapter stub
- Web shell: project list, create project, open document (still the box)
- Document stored as TS source + JSON metadata + blob artifact URLs (MinIO)
  **Ships**: `docker compose up`, create project, see it after refresh.

### Slice 2 — SDK, Expression Engine, Authoring Layer, Runtime

The core of the dual-write model. The biggest slice.

- `packages/sdk` minimal API: `defineDocument`, `parameters`, `body`, `pad`, `sketch`
- `packages/expr` parameter expression parser (Pratt), units, dependency graph, cycle detection, clear diagnostics
- `packages/authoring` TS-AST parse (`ts.createSourceFile`) → `DocumentAST` (parameters[], features[]); codemod library `(ast, op) => ast` for every authoring op planned in later slices; Prettier-formatted printer via ts-morph
- Round-trip test suite: for a corpus of document fixtures, `print(parse(source)) === source` (modulo formatting)
- `packages/runtime` executes the printed document in an isolated worker with timeout + memory cap; feature DAG topological evaluation with per-feature memoization keyed on input hash
- CLI `cad build` compiles & executes `document.ts` → tessellation JSON
- Server endpoint `POST /documents/:id/build`
  **Ships**: `cad build hello.ts` → JSON mesh. Parameter change rebuilds. Round-trip tests green.

### Slice 3 — Viewport v1 & Trackpad Navigation

Professional 3D viewing.

- Three.js viewport with camera controller: trackpad pan/zoom/orbit, mouse fallback, configurable profiles
- Perspective / ortho / iso toggle, named views
- Shaded / shaded+edges / wireframe
- Selection picking (face/edge/vertex) with hover highlight
- Viewport receives tessellation from runtime via WebSocket
  **Ships**: Open a document, pan/zoom/orbit/pick.

### Slice 4 — Dual-Write UI ↔ Code

Edit the document from either side; both stay in sync.

- Sidebar feature tree bound to `DocumentAST` (not runtime result)
- Parameter inspector: typed inputs, unit picker, expression editor with live evaluation preview
- **Monaco is fully read-write** and debounced: edit code → reparse → diff AST → patch tree + rebuild
- **UI actions are codemods**: every button emits an `AuthoringOp` that runs through `packages/authoring`, producing a new source string which replaces the Monaco buffer
- Authoring mutex prevents concurrent UI+code edits
- Undo/redo operates on the document source history (single stack for both surfaces)
- Parameter change flows: UI inspector → authoring codemod → new source → runtime re-eval → viewport refresh
  **Ships**: Scrub a parameter in the inspector AND in Monaco; both surfaces stay in perfect sync; undo works across both.

### Slice 4b — Handbook Infrastructure (parallel to Slice 4)

Build the first-class handbook system before feature breadth explodes.

- `packages/handbook` scaffold: MDX content under `content/`, frontmatter schema (Zod), build-time index generator
- Search: MiniSearch lexical index built at package build time, shipped as a JSON blob
- Programmatic API: `search`, `get`, `list`, `forSdkOp`
- In-app handbook viewer in `apps/web`: MDX renderer (`@mdx-js/react`), TOC, deep links, code copy, theme-aware
- Contextual `?` buttons wired into Slice 4's feature tree + inspector
- Command palette (placeholder for Slice 11) surfaces handbook hits
- CLI `cad docs` subcommand renders MDX in the terminal
- **`docMetadata` contract for SDK ops**: every SDK op exports a `docMetadata` object; a codegen step produces stub MDX for any op lacking a page
- **CI gate**: `lint:handbook` fails if any SDK op lacks a handbook page; new ops without docs block merge
- Initial content: Concepts (document model, feature DAG, references, parameters, expressions, dual-write), Workflows (create project → sketch → pad), FAQ
  **Ships**: Open the app, press `?` on a feature, read the entry; `cad docs search pad` in the terminal; CI gate fails on purpose-broken op to prove it works.

### Slice 5 — Sketch Subsystem v1

Draw a 2D sketch on a plane with constraints — inside the dual-write model.

- `packages/sketch` wraps PlaneGCS
- SVG is the canonical sketch format; sketch AST ↔ SVG round-trip
- Sketch mode UI: primitives + constraints listed in the feature list
- Solver runs on every edit; over/under-constrained highlighting
- Sketch persisted as an SDK call in `document.ts` with the embedded SVG string; entering/exiting sketch mode is itself a codemod so the Monaco view updates live
  **Ships**: Enter sketch mode on XY plane, draw a constrained rectangle, exit — Monaco shows the `sketch({ plane, svg, constraints })` call.

### Slice 6 — Pad (Sketch → 3D) — Golden Workflow

Close the primary workflow end-to-end.

- SDK `pad({ sketch, length, direction })`
- Feature tree shows sketch under pad
- Reference resolution for the sketch plane (Handle by construction)
- Generated solid back to viewport
- **Golden demo**: parametric **mounting spacer / riser block** committed as `examples/spacer.ts` — sketch a rectangle on XY, pad to `height`, three parameters (`length`, `width`, `height`). Ships as the Slice 6 e2e fixture and Playwright golden journey, and is printable as-is.
  **Ships**: Open the spacer example, scrub parameters, export STL, print — the advertised workflow works in one sitting.

### Slice 7 — Reference System Hardening

Picks survive feature edits.

- Formalize `Handle/Selector` in `packages/references`
- Three-layer resolver: finder → construction → hash
- UI picker records finder queries from user clicks
- Edit earlier feature, verify downstream picks still resolve
- Reference repair wizard when resolution fails
  **Ships**: Pick a face, edit earlier feature, downstream fillet still points at the right face.

### Slice 8 — Core Feature Library

Critical mass of features.

- Revolve, sweep, loft, fillet, chamfer, shell, boolean (union/cut/intersect)
- Linear and polar patterns, mirror
- Datum plane, axis, point, CSYS
- Unit tests per feature; deterministic snapshot tests on tessellation hashes
- **Upgraded golden demo**: evolve `examples/spacer.ts` into `examples/raspberry-pi-mount.ts` — a full parametric **Raspberry Pi 4 mounting plate**. Uses rectangle pad (base), circle sketch + pocket (4× M2.5 mount holes on the 58×49 mm pattern), fillet (corners), chamfer (hole edges), linear pattern (cable-tie slots), mirror (retaining lip). Parameter set: `boardLength=85`, `boardWidth=56`, `holePattern=58`, `holeOffset=49`, `holeDia=2.7`, `plateThickness=3`, `cornerRadius=3` plus derived expressions. Printed on a real FDM printer as acceptance evidence (manual workflow at Slice 8; upgraded to **one-click LAN direct print** once Slice 10c lands).
  **Ships**: A realistic, printable parametric part — photographable proof that the system is CAD, not a toy.

### Slice 9 — SVG Import & Measure

Bring external designs in.

- SVG importer → sketch AST (path parsing, bezier handling)
- Measure tool: click two known points → enter real distance → uniform scale
- Placement on target plane
  **Ships**: Drag in an SVG logo, measure a known edge, snaps to real units.

### Slice 10 — Export Pipeline

Get models out.

- STEP export (OCCT writer)
- STL / 3MF for printing
- OBJ / GLTF for web/render
- SVG wireframe export with hidden-line removal and stroke classes per edge type
- CLI `cad export --format step`, web Export menu
  **Ships**: Export as STEP and re-import round-trips cleanly.

### Slice 10b — Printer Integration v1 (Bambu 3MF Handoff)

Make the Slice 10 3MF export land cleanly in Bambu Studio.

- Extend `packages/exporters` 3MF writer to emit BambuStudio-compatible metadata: thumbnails (rendered from the viewport camera), plate dimensions, unit tag, recommended filament hint, model name/description
- Enrich the 3MF with multiple plate thumbnails (top, iso) for a good preview in Bambu Studio's file browser
- Export menu: new **"Download for Bambu Studio"** action (alongside generic 3MF) — same file, same pipeline, different button label to signal the tested target
- Handbook: "Printing → Bambu Studio handoff" page with one-minute walkthrough and screenshots
- API e2e test: emit a 3MF, parse it back, assert Bambu metadata keys present; integration with BambuStudio validated manually on a real install (documented in `docs/verification/slice-10b.md`)
  **Ships**: Click "Download for Bambu Studio", double-click the file, Bambu Studio opens the part ready to slice.

### Slice 10c — Printer Integration v2 (BambuLab LAN Direct Print)

Skip the handoff: send the part straight to the printer over LAN.

- `packages/printers` scaffold: `PrinterProvider` interface, registry, encrypted credential store (Postgres column encrypted with per-install KMS key), Zod schemas in `packages/protocol`
- `packages/printers/providers/bambulab` — MQTT client (`mqtt` npm pkg) + FTP client (`basic-ftp` npm pkg), implementing the documented LAN protocol; topics and payloads per Doridian's `OpenBambuAPI` reference
- Server: persistent per-user MQTT connections managed by a `PrinterSupervisor` service; status events pushed to the browser via the existing WebSocket channel
- DB schema: `printers` table (owner, provider, host, serial, encrypted access code, nickname, last_seen, last_status)
- UI: new **Printers** page (list, add, edit, remove, test connection, live status card); per-document **"Send to Printer"** action with printer picker + confirmation dialog; live progress card in the viewport chrome while a job is running
- Mock provider for tests; real-printer smoke-test job gated behind `PRINTER_SMOKE=bambu_x1c` env var (opt-in)
- Handbook: "Printing → BambuLab LAN setup" (enable Developer Mode, find access code + serial, add printer in CAD app), "Printing → Sending a job", "Printing → Troubleshooting"
- Audit log: every print command and every credential change recorded
  **Ships**: Add a BambuLab printer, click "Send to Printer" on the Slice 8 Raspberry Pi mount example, watch the job start and stream live status until the part lands on the bed.

### Slice 11 — Command Palette, Keyboard, Polish

Feels like a pro tool.

- Cmd+K palette, keyboard registry, conflict detection
- Onshape-compatible defaults, remappable
- Hover tooltips, command descriptions
- Full dark/light theme
- Accessibility pass (focus states, ARIA, keyboard-only flows)
  **Ships**: A designer can drive the app without reading docs.

### Slice 12 — Server API Surface

Headless control for integrations.

- OpenAPI spec generated from Zod schemas in `packages/protocol`
- Local-user auth hardened; optional OIDC adapter wired (for enterprise on-prem)
- Full lifecycle endpoints: projects, documents, versions, parameters, builds, exports
- Authoring ops exposed as REST operations that call `packages/authoring` (the same codemods the UI uses)
- Rate limiting, request tracing
  **Ships**: `curl` can create a project, upload a document, apply an authoring op, build, download STEP.

### Slice 13 — CLI

Developer UX for code-first users.

- `cad init` scaffold, `cad build`, `cad export`, `cad params set`, `cad diff`, `cad run <script>`
- Token auth via OS keychain
- Works against local runtime or remote server transparently
  **Ships**: A CI pipeline can build CAD models headlessly.

### Slice 14 — MCP Server

AI-native control. Because authoring, handbook, and printers are already libraries, MCP tools are thin wrappers.

- **Authoring tools**: `list_projects`, `open_document`, `get_document_source`, `apply_authoring_op`, `set_parameter`, `build`, `export`, `query_references`
- `apply_authoring_op` is the universal write tool — one op type per codemod, all Zod-validated
- **Handbook tools** (so the agent can self-educate before acting): `handbook_search`, `handbook_get`, `handbook_list`, `handbook_for_op`
- **Printer tools** (so the agent can close the loop from code to physical part): `printer_list`, `printer_status`, `printer_send`, `printer_cancel` — each Zod-validated, each calls through to the same `PrinterProvider` the UI uses
- MCP server prompts instruct the agent to call `handbook_for_op` before first use of any authoring op — contextual guidance is served, not hallucinated
- Session model ties tools to a document with audit log; every authoring op and every print command records which handbook pages were consulted (for eval + trust)
  **Ships**: Claude/any MCP client reshapes a model through conversation, guided by the same handbook the human UI shows; every AI edit goes through the same codemods as the UI and CLI, and the agent can also dispatch a print to a real BambuLab printer on the same LAN.

### Slice 15 — On-Prem Packaging & Observability

Production-grade self-hosted deployment.

- Hardened Docker Compose stack (postgres, minio, server, worker, web) with healthchecks, volumes, backup hooks
- Optional Helm chart for on-prem Kubernetes (larger installs)
- OpenTelemetry across runtime, server, worker (OTLP exporter — customer points at their collector)
- Metrics: build time, kernel memory, cache hit rate, error rates (Prometheus scrape endpoint)
- Structured pino logging
- Upgrade path: signed release images, Postgres migrations via a dedicated migrator container, documented rollback
- Install guide + admin docs + backup/restore runbook
  **Ships**: One-command install, dashboards, documented upgrade/backup procedure.

## Tech Stack Summary

| Concern            | Choice                                                       |
| ------------------ | ------------------------------------------------------------ |
| Kernel             | `replicad` + `opencascade.js` WASM                           |
| Sketch solver      | `@salusoft89/planegcs`                                       |
| 3D rendering       | `three.js`                                                   |
| UI framework       | React 19 + Vite                                              |
| UI kit             | Tailwind + shadcn/ui + Radix                                 |
| Client state       | Zustand (viewport/UI), TanStack Query (server)               |
| Code editor        | Monaco                                                       |
| Server             | Node 22, Fastify 5                                           |
| Schemas            | Zod → OpenAPI, shared across client/server/CLI/MCP           |
| DB                 | PostgreSQL 16                                                |
| Blob store         | S3-compatible                                                |
| Auth               | OIDC                                                         |
| Monorepo           | pnpm + Turborepo                                             |
| Unit / integration | Vitest + `@vitest/coverage-v8`                               |
| API e2e            | Vitest + Supertest + Testcontainers (Postgres, MinIO)        |
| UI e2e (focused)   | Playwright (Chromium, ≤10 tests, ≤3 min budget)              |
| Component tests    | React Testing Library + Vitest                               |
| Mutation testing   | Stryker (weekly, core packages)                              |
| Snapshot tests     | Tessellation hashes + STEP round-trip on a reference library |
| Printer transport  | `mqtt` + `basic-ftp` (BambuLab LAN provider)                 |
| Printer reference  | Doridian's `OpenBambuAPI` LAN protocol docs                  |
| Observability      | OpenTelemetry, Prometheus, pino                              |

## Critical Files to Create

- `PLAN.md` — this roadmap, copied into repo root
- `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.eslintrc`, `.prettierrc`
- `packages/kernel/src/index.ts` — replicad boot + tessellation
- `packages/sdk/src/index.ts` — `defineDocument`, `parameters`, `body`, `pad`, `sketch`
- `packages/authoring/src/parse.ts` — `document.ts` → `DocumentAST`
- `packages/authoring/src/codemods/*.ts` — one file per authoring op
- `packages/authoring/src/print.ts` — `DocumentAST` → formatted TS
- `packages/expr/src/parser.ts` — Pratt expression parser with units
- `packages/runtime/src/execute.ts` — sandboxed document runner
- `packages/references/src/resolve.ts` — Handle → entity resolver
- `packages/protocol/src/schemas.ts` — Zod command/response schemas
- `apps/server/src/server.ts` — Fastify bootstrap
- `apps/web/src/App.tsx` — layout shell
- `packages/handbook/content/**/*.mdx` — authored content
- `packages/handbook/src/api.ts` — `search`, `get`, `list`, `forSdkOp`
- `packages/handbook/src/build-index.ts` — build-time search index generator
- `packages/printers/src/provider.ts` — `PrinterProvider` interface + registry
- `packages/printers/src/credentials.ts` — encrypted credential store
- `packages/printers/providers/bambulab/src/index.ts` — MQTT + FTP provider
- `packages/exporters/src/threemf-bambu.ts` — Bambu-enriched 3MF writer
- `deploy/compose/docker-compose.yml` — on-prem stack

## Testing Strategy (first-class)

Deliberately asymmetric pyramid: **wide at unit+integration, wide at API e2e, narrow at UI e2e.** Playwright is powerful but slow and flaky; we keep it focused on a handful of golden user journeys and push every other UI concern down to component tests and API e2e.

### Layer 1 — Unit tests (extensive)

- **Framework**: Vitest with `@vitest/coverage-v8`
- **Scope**: every pure function in `packages/*` — expression parser, authoring codemods, reference resolver, geometry math, unit conversion, handbook index, Zod schemas
- **Coverage target**: **≥ 90% lines / ≥ 85% branches** on `packages/expr`, `packages/authoring`, `packages/references`, `packages/geometry`, `packages/sketch`, `packages/sdk`, `packages/protocol`. Softer 80% floor on kernel-adjacent code where OCCT is involved.
- **Style**: fast (<5s total per package), isolated, no network, no worker boot. Pure functions only.

### Layer 2 — Integration tests (extensive)

- **Framework**: Vitest with per-suite setup
- **Runtime + kernel integration**: real `replicad`/OCCT WASM boot, real authoring codemod, real document execution; assert deterministic tessellation hashes on a fixture corpus
- **Authoring round-trip corpus**: ~50 fixture documents; for each, `print(parse(src)) === src` (modulo formatting), plus applying each codemod and verifying the resulting source parses and evaluates
- **Sketch solver integration**: PlaneGCS solving real constraint systems; check convergence and stability
- **Handbook integration**: build index, exercise `search`/`get`/`forSdkOp` against real MDX content; assert every SDK op has a page (CI gate)
- **Reference system integration**: load a document, edit a feature, verify downstream Handles still resolve through the three-layer chain
- **Coverage target**: exercised **end-to-end within a single process**, no HTTP

### Layer 3 — API e2e tests (intensive)

This is where most of the system-level coverage lives.

- **Framework**: Vitest + Supertest against a real Fastify instance + Testcontainers for Postgres and MinIO. Real kernel worker pool, real authoring, real handbook, real exporters.
- **Scope**: every REST endpoint with happy-path, auth-denied, validation-error, and idempotency cases
- **Workflow tests** driven through the API: project CRUD → document CRUD → authoring op → build → export → download → re-import. The entire "advertised workflow" proven through HTTP with no browser.
- **Contract tests**: Zod schemas in `packages/protocol` exercised both as request validators and response shapes; drift between client types and server types fails the build.
- **Reference model library**: ~20 reference `document.ts` files built via the API on every PR; STEP round-trip asserted; tessellation hashes snapshotted.
- **Performance budgets**: assert p95 build time for reference models stays under set thresholds; regressions fail CI.
- **MCP server tests**: the MCP server runs in-process with a test client; every tool exercised (handbook query → authoring op → build → export). Same Zod schemas as REST.
- **CLI tests**: spawn the `cad` binary against a running API in Testcontainers; assert `cad init → cad build → cad export` works end-to-end.

### Layer 4 — UI e2e tests (focused & fast)

Kept intentionally small — "golden journeys" only. Everything else is a component test or an API e2e test.

- **Framework**: Playwright 1.50+, headless, single browser (Chromium) in CI, optional cross-browser nightly
- **Target**: **≤ 10 tests total, ≤ 3 min CI wall time** for the whole UI e2e suite
- **Hermetic fixture**: Docker Compose app with seeded data; each test gets an isolated project via API setup (fast) and a single browser context (no login flow per test)
- **Golden journeys** (the only ones we Playwright):
  1. Onboarding: launch → log in → create project → create document → see viewport
  2. Core workflow: sketch rectangle → pad → see 3D solid (the Slice 6 golden)
  3. Dual-write integrity: edit in Monaco → feature tree updates; edit in inspector → Monaco updates
  4. Sketch constraint failure UX: over-constrain → red highlight → resolve
  5. Reference survival: edit earlier feature → downstream fillet still binds
  6. Export: STEP + SVG wireframe export → files downloaded
  7. Handbook access: press `?` on a feature → right page opens at the right anchor
  8. Command palette: Cmd+K → search → run command
- **Component tests for everything else**: React Testing Library + Vitest for individual components, inspectors, dialogs, pickers. Fast, no browser.
- **Flake policy**: retry once on CI; auto-quarantine on two consecutive flakes; quarantined tests trigger a high-priority fix task — they never silently linger.

### CI Enforcement

- Unit + integration run on every push (parallel by package)
- API e2e runs on every PR against Testcontainers
- Playwright golden suite runs on every PR (≤ 3 min budget)
- Coverage gates block merges below thresholds
- Handbook gate: every new SDK op must ship a handbook page
- Mutation testing (Stryker) runs weekly on `packages/expr`, `packages/authoring`, `packages/references` to catch weak assertions
- Observability: every test run uploads traces + screenshots + videos (Playwright) as CI artifacts

### Per-Slice Definition of Done

A slice is not shippable until:

1. Unit tests added for every new pure function (coverage gate green)
2. Integration tests added for every new runtime/kernel/authoring path
3. API e2e added for every new endpoint and every new MCP tool (with validation, auth, and error paths)
4. Playwright **only** if a new golden journey is introduced (otherwise none)
5. Handbook pages added for every new SDK op (CI gate green)
6. Reference model in the library updated if the slice changes kernel output
7. Manual verification checklist in `docs/verification/slice-N.md`

## Verification

- Every slice ships with the tests defined above; the Testing Strategy section is the contract.
- Golden end-to-end test per slice exercises the full stack through the API e2e layer. Slice 6 golden: _create project → add document → sketch rectangle → pad → compare tessellation hash_ — runs both as an API e2e and as a single Playwright journey.
- `cad build` runs the reference-model library on every PR; STEP round-trip + tessellation snapshot diff catches kernel/API regressions.
- Manual verification checklist per slice in `docs/verification/slice-N.md`.

## Resolved Decisions

- Deployment → **self-hosted on-prem** (Docker Compose first, Helm optional)
- Parameters → **expressions from day one** (expr parser + deps graph in Slice 2)
- Authoring → **strict dual-write** (AST codemods in `packages/authoring` from Slice 2)
- Printer integration → **Bambu handoff (10b) + LAN direct print (10c)** in v1, LAN-only transport, pluggable provider interface from day one so Prusa/Klipper/OctoPrint can follow; BambuLab Cloud API explicitly deferred
- Golden demo → a **printable part**, grown across slices:
  - **Slice 6 (pad-only)**: a **parametric mounting spacer / riser block** — sketch a rectangle, pad to target height, nothing else. Parameters: `length`, `width`, `height`. Proves the advertised sketch→pad workflow end to end. Printable in minutes.
  - **Slice 8 (full feature library)**: upgrade that base plate into a **parametric Raspberry Pi 4 mounting plate** — a real, printable, widely-known reference part. Exercises **every** Slice 8 feature in a single file: rectangle sketch + pad (base), circle pattern sketch + pocket (4× M2.5 mount holes on the standard 58×49 mm pattern), fillets (corners), chamfers (hole edges), linear pattern (cable-tie slots), mirror (retaining lip). Parameters include `boardLength=85`, `boardWidth=56`, `holePattern=58`, `holeOffset=49`, `holeDia=2.7`, `plateThickness=3`, `cornerRadius=3`, plus derived expressions for hole centers — proves the expression engine end to end.
  - 3DBenchy was considered and explicitly rejected: organic surfaces and sweeps are out of scope for the Slice 6/8 feature set; the Pi mounting plate maps 1:1 onto the primitives we ship.
- Units → **mm / deg** defaults for the first shot; imperial deferred (no migration cost later since parameters already carry a unit tag through `packages/expr`).

## Deferred Ideas (captured for later, not in v1)

- **Server-side slicing** (BambuStudio-CLI or PrusaSlicer-CLI in a worker container) — skip Bambu Studio entirely, emit sliced 3MF/G-code ready for direct print. Turns the CAD app into a full print pipeline. Adds a heavy CLI dependency and per-printer slicing profiles; revisit after Slice 10c is in production and we have real usage data on where the handoff friction actually lives.
- **BambuLab Cloud transport** — reach printers over the internet via BambuLab account credentials. Useful for off-LAN scenarios but couples on-prem install to a third-party cloud. Revisit only if customers ask.
- **Additional printer providers** — Prusa Connect, Klipper/Moonraker, OctoPrint. The `PrinterProvider` interface is designed so each is a standalone package; priority driven by customer demand.
- **Print job queue** — multi-job queuing, scheduling, printer pooling. First shot is one-job-at-a-time per printer.

## Remaining Open Questions

None blocking. Implementation can begin once this plan is approved.

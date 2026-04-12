Run quality checks. Always run the complete quality check, regardless of the previous changes. The complete stack shall be checked with all its features. These checks serve as final checks before merging or deploying, so all errors and vulnerabilities must be fixed.

> **Pre-Slice-0 note:** The repo currently only has the `pnpm build` stub. Most steps below become meaningful once Slice 0 (`PLAN.md § Slice 0 — Foundations`) has landed. If a step references a script that does not yet exist, that is a signal Slice 0 work is pending — log it and move on, do not fabricate scripts.

Before checking the whole stack, do some checks for your latest work:

- Did you align the change with `PLAN.md` (the slice you are working on) and the architectural constraints in `CLAUDE.md` (replicad kernel, strict dual-write, Handles, expressions, single-source-of-truth commands, on-prem only)?
- Did every new SDK op ship a handbook page in `packages/handbook`? The `lint:handbook` CI gate enforces this — no docs, no merge.
- Did you write tests at the right pyramid layer? Unit + integration for every new pure function and runtime path; API e2e for every new REST endpoint, MCP tool, and CLI command. Playwright **only** if a brand-new golden journey is introduced (the suite stays ≤10 tests, ≤3 min wall time).
- Did your change affect kernel output? If yes, re-snapshot the reference-model library (STEP round-trip + tessellation hashes) — exercised by `pnpm test:api`.
- Did you update the manual verification checklist in `docs/verification/slice-N.md` for the slice you touched?
- Did your change touch authentication, input validation, secrets, deserialization, file I/O, or network surfaces? If yes, document the impact in `security-analysis.md` in the same change.
- Did you observe any issues unrelated to your change (warnings, deprecations, flaky tests, log noise)? Log them in `known-issues.md` using the schema in its "How to log an issue" section. Do not silently ignore.

The following instructions count for the whole stack, independent of the latest changes:

If applicable: run the **ide - getDiagnostics** MCP to surface IDE warnings and errors, and fix them.

1. Recreate clean base if dependencies changed
   - Run `pnpm clean`
   - Run `pnpm install`

2. Check for IDE issues and fix
   - Run the IDE MCP to find errors and issues

3. Run linter: `pnpm lint`
   - This runs both `lint:code` (ESLint) and `lint:handbook` (the handbook CI gate)
   - Fix any errors before proceeding
   - Also fix warnings — we want productive code, warnings often indicate bad design
   - **No `console.log`** in committed code (CLAUDE.md): use `pino` on the server, the thin client wrapper in the browser
   - If `lint:handbook` fails, an SDK op is missing its handbook page in `packages/handbook` — add it, do not silence the gate

4. Run format check: `pnpm format:check`
   - Fix with `pnpm format`

5. Run typecheck: `pnpm typecheck`
   - Strict TS, no `any` in application code, `unknown` + narrow for external input
   - Fix every error before proceeding

6. Run unit + integration tests: `pnpm test`
   - Vitest across all packages, real `replicad`/OCCT WASM kernel, real authoring round-trips, real PlaneGCS, real handbook index
   - Fix any failing tests before proceeding
   - Fix the implementation, not the test (unless the test is actually wrong)

7. Run coverage: `pnpm test:coverage`
   - Per `PLAN.md § Testing Strategy`, the floor is **≥ 90% lines / ≥ 85% branches** on `packages/expr`, `packages/authoring`, `packages/references`, `packages/geometry`, `packages/sketch`, `packages/sdk`, `packages/protocol`
   - Softer 80% floor on kernel-adjacent code where OCCT is involved
   - Coverage gates block merges below thresholds — fix gaps before continuing

8. Run API e2e tests: `pnpm test:api`
   - Vitest + Supertest against a real Fastify instance with Testcontainers (Postgres + MinIO), real kernel worker pool, real authoring, real exporters
   - Exercises every REST endpoint, every MCP tool, every CLI command
   - Reference-model library (STEP round-trip + tessellation snapshots) runs here — kernel/API regressions surface as snapshot diffs
   - Fix failures before proceeding

9. Run UI e2e tests: `pnpm test:e2e`
   - Playwright golden journeys only — strict budget: **≤ 10 tests, ≤ 3 min CI wall time**
   - Flake policy: retry once, auto-quarantine on two consecutive flakes; quarantined tests block — never let them silently linger
   - Do not add a new Playwright test unless you are introducing a new golden journey from `PLAN.md § Layer 4`. Everything else belongs in component tests (React Testing Library) or in `pnpm test:api`

   **Debugging failing UI e2e tests:** when one spec fails, re-run only that one instead of the full suite.
   ```bash
   # By spec file
   pnpm test:e2e -- sketch-pad.spec.ts

   # By test name pattern
   pnpm test:e2e -- --grep "dual-write"

   # With debug mode (pauses at each step)
   pnpm test:e2e -- --debug
   ```
   Only run the full `pnpm test:e2e` for the final verification pass.

10. Run dependency audit: `pnpm audit:deps`
    - Single orchestrator covering **vulnerabilities, unused/missing deps, outdated deps, and license policy** across the whole pnpm workspace. See `docs/dependency-audit.md` for the full policy.
    - Blocks on:
      - moderate+ severity vulnerabilities in production deps (`pnpm audit:vulns`)
      - any unused, unused-dev, or unlisted dependency reported by knip (`pnpm audit:unused`)
      - any direct dep that is **at least one major version behind upstream** (`pnpm audit:outdated`)
      - any package shipping a license on the blocklist — GPL/AGPL/LGPL/SSPL family (`pnpm audit:licenses`)
    - Minor / patch outdated drift and review-list licenses (MPL/EPL/CDDL/UNKNOWN) are reported as info — surface them, do not silence them
    - Fix vulns by upgrading the offending dependency: `pnpm update --latest <pkg>` (or pin a patched version explicitly). Do not ignore moderate+ findings — unignore-and-fix is the rule
    - For iterative fixing, run the subchecks individually: `pnpm audit:vulns`, `pnpm audit:unused`, `pnpm audit:outdated`, `pnpm audit:licenses`
    - The full `pnpm audit:deps` orchestrator must be the final pass and exit zero before quality is considered green
    - For the step-by-step agent walkthrough (with pre-checks and summary template), run `/audit-deps`

After completion, summarize:
- Number of lint warnings (errors must be 0)
- Coverage results (per-package thresholds met)
- Test results (unit + integration + API e2e + UI e2e all pass)
- Security audit results (no moderate+ vulnerabilities)
- Any manual fixes applied
- Known bugs logged (see step 11)
- Commit the changes locally

11. **Log known bugs:** review all output from the steps above (install logs, lint, typecheck, test output, coverage report, audit results, IDE diagnostics). If you observed any warnings, errors, deprecations, or unexpected behavior **unrelated to the change being checked**, append an entry to `known-issues.md` using the schema documented at the top of that file:

    ```
    ## [Priority] Short title — affected area
    **Observed:** YYYY-MM-DD
    **Where:** Build / Lint / Typecheck / Test / API e2e / Playwright / Audit (vulns | unused | outdated | licenses) / IDE / etc.
    **Affects:** Package(s) or component(s)
    **Symptom:** ...
    **Root cause:** ... (or "To be investigated.")
    **Workaround:** ... (or "None.")
    ```

    Priorities: P0 critical, P1 high, P2 medium, P3 low. Do not fix these — just log them. Nothing should be silently ignored.

12. **Definition of Done** (mirror of `PLAN.md § Per-Slice Definition of Done`) — confirm before declaring quality green:
    - [ ] Unit tests added for every new pure function (coverage gate green)
    - [ ] Integration tests added for every new runtime/kernel/authoring path
    - [ ] API e2e added for every new endpoint, MCP tool, and CLI command (with validation, auth, and error paths)
    - [ ] Playwright touched **only** if a new golden journey was introduced
    - [ ] Handbook pages added for every new SDK op (`lint:handbook` green)
    - [ ] Reference-model library updated if the change affects kernel output
    - [ ] Manual verification checklist updated in `docs/verification/slice-N.md`
    - [ ] `security-analysis.md` updated if the change touches a security surface
    - [ ] `known-issues.md` updated with any unrelated issues observed

Keep the codebase clean: remove any helper scripts created while fixing issues.

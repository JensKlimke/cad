Run the dependency audit. This is the canonical, runnable check for vulnerabilities, unused/missing dependencies, outdated dependencies (with major-version drift blocking), and license policy across the entire pnpm workspace. Run it before merging any change that touches `package.json`, the lockfile, or `packages/*`.

> **Pre-Slice-0 note:** The repo currently only has the root workspace and `@cad/config`. The audit script handles missing packages gracefully and will scale to the full monorepo as Slice 0+ work lands. If `pnpm install` has not been run, the audit reports each subcheck as `skipped` rather than failing.

Before running the audit, do the pre-checks for any change you just made:

- Did your change add a new dependency? Did you actually need it, or is there an existing package or in-repo utility that does the job? Per `rules/common/development-workflow.md` step 0 — search GitHub, registries, and `packages/*` first; prefer battle-tested libraries over hand-rolled code.
- Did you check the new dep's license? Only the licenses listed in `scripts/audit-deps.config.json` § allow are accepted automatically. The allowlist covers permissive licenses (MIT/Apache/BSD/ISC/...) and file-level weak copyleft (MPL-2.0/EPL/CDDL). GPL/AGPL/LGPL/SSPL are blocked outright; `UNKNOWN` licenses need a human decision.
- Did you check the dep's maintenance status (last release date, open issue count, weekly downloads)? An abandoned dep is a future security incident.
- Did you remove an old dep that the new one replaces? Unused deps will be flagged by `audit:unused`.
- Did you justify any pinned (non-latest) version with a comment in the PR description? Outdated deps (≥ 1 major version behind) block the audit.

The audit covers four concerns. Each can be run individually for iterative fixing, but the final pass must be the full orchestrator.

1. Recreate clean base if dependencies changed
   - Run `pnpm clean`
   - Run `pnpm install`
   - Watch for new peer-dep warnings beyond the three already documented in `known-issues.md`. New warnings → log them in `known-issues.md`.

2. Vulnerability scan: `pnpm audit:vulns`
   - Wraps `pnpm audit --prod --audit-level=moderate --json`
   - Blocks on **moderate or higher** in production dependencies
   - Dev-only vulnerabilities are reported as informational (not blocking) but still surfaced
   - Fix: `pnpm update --latest <pkg>` or pin a patched version explicitly
   - Do **not** use ignore lists. The rule is unignore-and-fix.

3. Unused dependency scan: `pnpm audit:unused`
   - Wraps `knip` with the workspace config in `knip.json`
   - Blocks on unused dependencies, unused devDependencies, and unlisted (missing) dependencies
   - Fix unused: `pnpm remove <pkg>` from the offending workspace package
   - Fix missing: `pnpm add <pkg> --filter <package>`
   - If a dep is intentionally referenced only at runtime / via dynamic import / by a tool that knip cannot statically detect, add it to the `ignoreDependencies` array in `knip.json` **with a comment explaining why** — never silence without justification

4. Outdated scan: `pnpm audit:outdated`
   - Wraps `pnpm outdated -r --format json`
   - **Blocks on major-version drift** for any direct dependency
   - Minor and patch drift are informational only — they appear in the summary, but do not fail the audit
   - Fix major drift: read the upstream changelog **before** upgrading. Major bumps are breaking by definition. Update in a focused PR, not bundled with feature work.

5. License scan: `pnpm audit:licenses`
   - Wraps `pnpm licenses list --prod --json`, parses against `scripts/audit-deps.config.json`
   - Blocks on the blocklist (GPL/AGPL/LGPL/SSPL family)
   - Surfaces `UNKNOWN`-licensed packages as informational — these need a human decision before they can be accepted; document the decision in `docs/dependency-audit.md` § exceptions and add the package to the `licenses.exceptions` array in the config file once accepted
   - Fix blocked licenses: replace the dependency with an allowlisted alternative

6. Full orchestrator: `pnpm audit:deps`
   - Runs all four subchecks in order, collects results, prints a summary table, exits non-zero on any blocking failure
   - This is the final pass — it must be green before merging or deploying
   - JSON output for machine consumption (CI, future MCP tooling): `pnpm audit:deps -- --json`

After completion, summarize:
- **Vulnerabilities**: count by severity (`critical`, `high`, `moderate`, `low`); confirm 0 at moderate+
- **Unused / missing**: count of unused deps, unused devDeps, unlisted deps; confirm all 0
- **Outdated**: count of major-drift deps (must be 0); count of minor/patch deps (informational)
- **Licenses**: count of blocked licenses (must be 0); count of review-list licenses (informational)
- **Manual fixes applied**: list packages updated, removed, or replaced
- **Known bugs logged**: see step 7

7. **Log known bugs**: review the audit output. If you observed any issue **unrelated to the change you are auditing** — a transient registry error, a flaky network call, an unexpected upstream deprecation — append an entry to `known-issues.md` using the schema documented at the top of that file:

   ```
   ## [Priority] Short title — affected area

   **Observed:** YYYY-MM-DD
   **Where:** Audit / Vulnerabilities / Unused / Outdated / Licenses
   **Affects:** Package(s)
   **Symptom:** ...
   **Root cause:** ... (or "To be investigated.")
   **Workaround:** ... (or "None.")
   ```

   Priorities: P0 critical, P1 high, P2 medium, P3 low. Do not fix orthogonal issues — just log them. Nothing should be silently ignored.

8. **Definition of Done** — confirm before declaring the audit green:
   - [ ] `pnpm audit:deps` exits 0
   - [ ] No moderate+ vulnerabilities in production dependencies
   - [ ] No unused, missing, or unlisted dependencies
   - [ ] No direct dependencies behind by a major version
   - [ ] No blocked licenses; any review-list licenses have a documented exception
   - [ ] `known-issues.md` updated with any unrelated findings
   - [ ] If a new dep was added: license decision recorded in `docs/dependency-audit.md` if it falls outside the default allowlist

For the policy, tool choices, and rationale, see `docs/dependency-audit.md`. The audit is invoked from `quality.md` step 10 as the canonical pre-merge check.

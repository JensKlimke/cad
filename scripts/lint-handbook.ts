/**
 * Handbook CI gate.
 *
 * Slice 0's handbook-as-a-feature infrastructure stub. Full enforcement lands
 * in Slice 4b when `packages/handbook` and `packages/sdk` exist and expose:
 *
 * - `packages/sdk/src/ops.ts` — canonical list of SDK op ids
 * - `packages/handbook/content/features/<op-id>.mdx` — one file per op
 *
 * This script walks those two lists and fails if any SDK op is missing its
 * handbook page. Slice 0 has zero SDK ops (the authoring layer lands in
 * Slice 2), so the check trivially passes — the script's purpose in Slice 0
 * is to be wired into `pnpm lint` so the CI gate cannot regress once real
 * content starts landing.
 *
 * Per the project plan:
 *
 * > From Slice 5 onward, every slice that ships a user-visible feature must
 * > land handbook entries in the same PR. Enforced by a CI check that fails
 * > if new SDK ops lack corresponding handbook pages.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface SdkOpRegistry {
  readonly ops: readonly string[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SDK_OPS_MODULE = path.join(REPO_ROOT, 'packages', 'sdk', 'src', 'ops.ts');
const HANDBOOK_FEATURES_DIR = path.join(REPO_ROOT, 'packages', 'handbook', 'content', 'features');

async function loadSdkOps(): Promise<readonly string[]> {
  if (!existsSync(SDK_OPS_MODULE)) {
    // Slice 0: no SDK yet, nothing to lint. This is the expected path until
    // Slice 2 lands `packages/sdk`.
    return [];
  }
  const moduleUrl = `file://${SDK_OPS_MODULE}`;
  const registry = (await import(moduleUrl)) as SdkOpRegistry;
  if (!Array.isArray(registry.ops)) {
    throw new TypeError(
      `lint-handbook: ${SDK_OPS_MODULE} must export an \`ops\` array — got ${typeof registry.ops}`,
    );
  }
  return registry.ops;
}

function findMissingPages(opIds: readonly string[]): readonly string[] {
  const missing: string[] = [];
  for (const opId of opIds) {
    const page = path.join(HANDBOOK_FEATURES_DIR, `${opId}.mdx`);
    if (!existsSync(page)) {
      missing.push(opId);
    }
  }
  return missing;
}

async function main(): Promise<void> {
  const opIds = await loadSdkOps();
  if (opIds.length === 0) {
    process.stdout.write('lint-handbook: no SDK ops registered yet — skipping (Slice 0 stub).\n');
    return;
  }

  const missing = findMissingPages(opIds);
  if (missing.length === 0) {
    process.stdout.write(
      `lint-handbook: OK — ${opIds.length} SDK op(s) all have handbook pages.\n`,
    );
    return;
  }

  process.stderr.write(
    `lint-handbook: FAIL — ${missing.length} SDK op(s) are missing handbook pages:\n`,
  );
  for (const opId of missing) {
    process.stderr.write(
      `  - ${opId} (expected at packages/handbook/content/features/${opId}.mdx)\n`,
    );
  }
  process.exitCode = 1;
}

await main();

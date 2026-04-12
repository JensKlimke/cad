/**
 * Integration tests for the `cad` binary.
 *
 * Spawns the built launcher (`bin/cad.js`) as a subprocess and asserts on
 * its stdout/stderr/exit. Depends on a prior `pnpm build` — Turbo's
 * `^build` DAG in `turbo.json` guarantees this when the tests run through
 * `pnpm test` rather than `vitest` directly.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '..');
const BIN_PATH = path.join(PACKAGE_ROOT, 'bin', 'cad.js');
const DIST_ENTRY = path.join(PACKAGE_ROOT, 'dist', 'index.js');

/** Preflight: fail loudly if the build artifact is missing. */
function requireBuild(): void {
  if (!existsSync(DIST_ENTRY)) {
    throw new Error(
      `@cad/cli integration tests require \`pnpm --filter @cad/cli build\` first; ` +
        `missing ${DIST_ENTRY}. Run \`pnpm test\` (via Turbo) so the build runs automatically.`,
    );
  }
}

function runCad(args: readonly string[]): string {
  requireBuild();
  return execFileSync(process.execPath, [BIN_PATH, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('cad binary', () => {
  it('prints a human-readable version table with no arguments', () => {
    const stdout = runCad([]);
    expect(stdout).toMatch(/^cad\s+\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/@cad\/kernel\s+\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/occt\s+replicad-opencascadejs@\d+\.\d+\.\d+/u);
    expect(stdout).toMatch(/node\s+v\d+\.\d+\.\d+/u);
  });

  it('prints the same table for `cad version`', () => {
    const bare = runCad([]);
    const explicit = runCad(['version']);
    expect(explicit).toBe(bare);
  });

  it('prints parseable JSON for `cad version --json`', () => {
    const stdout = runCad(['version', '--json']);
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    expect(parsed['cad']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(parsed['kernel']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(parsed['occt']).toMatch(/^replicad-opencascadejs@/u);
    expect(parsed['node']).toBe(process.version);
  });

  it('prints only the CLI version when given `--version`', () => {
    const stdout = runCad(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);
    expect(stdout).not.toContain('@cad/kernel');
  });
});

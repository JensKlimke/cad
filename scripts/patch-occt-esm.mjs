/**
 * Upstream workaround for `replicad-opencascadejs`.
 *
 * The package ships `src/replicad_single.js` as an Emscripten-generated
 * module that:
 *
 *   1. Ends with `export default Module;` (ES module syntax)
 *   2. But is declared `type: commonjs` via its `package.json`
 *   3. And uses CJS globals `__dirname`, `__filename`, `require()` inside
 *      its Node runtime branches
 *
 * Node 24 rejects this hybrid with `ERR_AMBIGUOUS_MODULE_SYNTAX`, and even
 * when forced through as ESM, the CJS globals are undefined at runtime
 * (`ReferenceError: __dirname is not defined`). This script idempotently:
 *
 *   - Injects `"type": "module"` into the installed `package.json` so both
 *     Node and Vite route the file through the ESM loader
 *   - Prepends a CJS-in-ESM polyfill preamble to `replicad_single.js` and
 *     `replicad_with_exceptions.js` so `__dirname`, `__filename`, and
 *     `require` resolve correctly inside the file's own code
 *
 * Runs as `postinstall` after every `pnpm install`. Tracked in
 * `known-issues.md`; delete this script when upstream ships a proper ESM
 * build.
 *
 * Notes on alternatives that were tried and rejected:
 *   - `.pnpmfile.cjs` `readPackage` hook: pnpm applies the return value to
 *     its dependency graph but writes the untouched manifest to disk.
 *   - `pnpm.packageExtensions`: documented to affect only dependency
 *     fields, not `type`.
 *   - `pnpm patch`: works, but requires committing a patch blob and a
 *     `pnpm.patchedDependencies` entry that re-generates across versions.
 *   - Vite `define` replacement: doesn't help raw `node` invocations and
 *     only papers over the Vitest path.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');
const PNPM_DIR = path.join(REPO_ROOT, 'node_modules', '.pnpm');

/** Files inside each replicad-opencascadejs install that need the polyfill preamble. */
const EMSCRIPTEN_FILES = ['src/replicad_single.js', 'src/replicad_with_exceptions.js'];

/** Marker the preamble stamps into the file so the patch is idempotent. */
const PREAMBLE_MARKER = '// <<cad-kernel:occt-esm-preamble>>';

// Preamble must be safe to evaluate in BOTH Node and browser contexts:
//
// - In Node, the `node:*` imports resolve normally and provide the CJS
//   globals Emscripten's runtime branches expect (`__dirname`,
//   `__filename`, `require`).
// - In the browser (Vite bundles the file into a Web Worker), Vite
//   externalizes `node:*` to empty stubs. The named imports become
//   `undefined`, so we detect that and substitute inert values. The
//   Emscripten code path that uses them lives inside
//   `if (ENVIRONMENT_IS_NODE) { ... }`, so the inert values are never
//   actually called in the browser.
const PREAMBLE = `${PREAMBLE_MARKER}
import * as __cadNodeModule from 'node:module';
import * as __cadNodeUrl from 'node:url';
import * as __cadNodePath from 'node:path';
const __cadHasNode = typeof __cadNodeModule.createRequire === 'function';
const __filename = __cadHasNode ? __cadNodeUrl.fileURLToPath(import.meta.url) : '';
const __dirname = __cadHasNode ? __cadNodePath.dirname(__filename) : '';
const require = __cadHasNode
  ? __cadNodeModule.createRequire(import.meta.url)
  : (() => {
      throw new Error('@cad/kernel occt shim: require() is not available in the browser runtime');
    });
// <<cad-kernel:occt-esm-preamble-end>>
`;

function findInstallRoots() {
  let entries;
  try {
    entries = readdirSync(PNPM_DIR, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  const roots = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('replicad-opencascadejs@')) continue;
    roots.push(path.join(PNPM_DIR, entry.name, 'node_modules', 'replicad-opencascadejs'));
  }
  return roots;
}

function patchManifest(root) {
  const manifestPath = path.join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (pkg.type === 'module') {
    return false;
  }
  pkg.type = 'module';
  writeFileSync(manifestPath, JSON.stringify(pkg, null, 2) + '\n');
  return true;
}

function patchEmscriptenFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  if (source.startsWith(PREAMBLE_MARKER)) {
    return false;
  }
  writeFileSync(filePath, PREAMBLE + source);
  return true;
}

function main() {
  const roots = findInstallRoots();
  if (roots.length === 0) {
    console.log('[patch-occt-esm] no replicad-opencascadejs installs found; skipping');
    return;
  }

  let manifestPatches = 0;
  let filePatches = 0;
  for (const root of roots) {
    if (patchManifest(root)) manifestPatches++;
    for (const relative of EMSCRIPTEN_FILES) {
      if (patchEmscriptenFile(root, relative)) filePatches++;
    }
  }
  console.log(
    `[patch-occt-esm] patched ${manifestPatches} manifest(s), ${filePatches} source file(s) across ${roots.length} install(s)`,
  );
}

main();

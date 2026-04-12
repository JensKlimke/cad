/**
 * OpenCascade.js (OCCT) initialization.
 *
 * `replicad` is stateful: it reads a process-wide `OpenCascadeInstance`
 * injected via its `setOC()` hook. We memoize the init promise per process
 * so every consumer of `createBox` (and future kernel ops) transparently
 * shares one booted kernel. The memoization is also the safety net that
 * prevents parallel re-init races if multiple callers touch the kernel
 * concurrently before the first boot resolves.
 *
 * ## Dual-target strategy
 *
 * Node (default): resolve `replicad_single.wasm` on the filesystem via
 * `createRequire` + `require.resolve`, then hand the path to Emscripten's
 * `locateFile` callback. Zero configuration for Node consumers.
 *
 * Browser (opt-in, exercised from apps/web in W8): the caller supplies a
 * `locateFile` that points at a bundler-resolved WASM URL (for Vite:
 * `import wasmUrl from 'replicad-opencascadejs/src/replicad_single.wasm?url'`).
 * The kernel does not ship its own browser boot path — browsers own their
 * asset pipeline.
 */

import { setOC } from 'replicad';
import opencascadeInit from 'replicad-opencascadejs/src/replicad_single.js';

import type { OpenCascadeInstance } from 'replicad-opencascadejs';

/**
 * Signature of the Emscripten-generated OCCT init function.
 *
 * Upstream `replicad-opencascadejs` ships a `.d.ts` that declares `init()`
 * with zero arguments, but the underlying Emscripten module does accept a
 * module-options object including `locateFile`. We cast locally — see
 * `known-issues.md` for the upstream typing gap.
 */
type OCCTInitFn = (options?: {
  readonly locateFile?: (file: string) => string;
}) => Promise<OpenCascadeInstance>;

const opencascade = opencascadeInit as unknown as OCCTInitFn;

/** Options accepted by {@link initOCCT}. */
export interface InitOCCTOptions {
  /**
   * Override the WASM file locator. Required in the browser — must return a
   * URL the runtime can fetch (typically a bundler-resolved asset URL).
   *
   * In Node, leave undefined: the kernel resolves the WASM file via
   * `require.resolve('replicad-opencascadejs/src/replicad_single.wasm')`.
   */
  readonly locateFile?: (file: string) => string;
}

let booted: Promise<OpenCascadeInstance> | null = null;

/**
 * Boot the OCCT WebAssembly kernel and wire it into `replicad`.
 *
 * Idempotent on success: the promise is cached after the first successful
 * boot, and subsequent calls return the same instance without re-running
 * the WASM init. On failure the cache is cleared so a later caller can
 * retry (e.g. after supplying `options.locateFile` in a browser).
 */
export function initOCCT(options: InitOCCTOptions = {}): Promise<OpenCascadeInstance> {
  if (booted) {
    return booted;
  }
  const attempt = bootOCCT(options);
  booted = attempt;
  attempt.catch(() => {
    // Only clear if we're still the owning promise — concurrent callers
    // must not wipe a subsequent successful boot.
    if (booted === attempt) {
      booted = null;
    }
  });
  return attempt;
}

async function bootOCCT(options: InitOCCTOptions): Promise<OpenCascadeInstance> {
  const locateFile = options.locateFile ?? (await resolveDefaultLocateFile());
  const oc = await opencascade({ locateFile });
  setOC(oc);
  return oc;
}

async function resolveDefaultLocateFile(): Promise<(file: string) => string> {
  /* c8 ignore start -- browser branch is exercised by apps/web in W8 */
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    throw new Error(
      '@cad/kernel: browser consumers must pass options.locateFile to initOCCT. ' +
        'Import replicad-opencascadejs/src/replicad_single.wasm via your bundler ' +
        "(Vite: `import wasmUrl from '.../replicad_single.wasm?url'`) and supply " +
        '`{ locateFile: () => wasmUrl }`.',
    );
  }
  /* c8 ignore stop */
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve('replicad-opencascadejs/src/replicad_single.wasm');
  return () => wasmPath;
}

/**
 * Return the OCCT version string reported by the booted kernel. Falls back
 * to the pinned `replicad-opencascadejs` package version when the C++ macro
 * is not exposed to JavaScript.
 */
export async function getOccVersion(): Promise<string> {
  const oc = await initOCCT();
  // OpenCascade.js exposes the OCCT version through a module-level constant.
  // The shape differs between builds, so probe defensively.
  const anyOc = oc as unknown as Record<string, unknown>;
  const candidate = anyOc['OCC_VERSION_COMPLETE'] ?? anyOc['OCC_VERSION'];
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate;
  }
  return 'unknown';
}

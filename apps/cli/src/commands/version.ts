/**
 * `cad version` command — report versions of every piece of the stack.
 *
 * Split into three pieces so the formatters are pure (trivial to unit-test)
 * and the orchestration (`run`) is a thin wrapper.
 *
 * All inputs are synchronous: the CLI deliberately does **not** boot the
 * OpenCascade.js WASM kernel just to print version info. Real OCCT version
 * strings are available from `@cad/kernel/getOccVersion()` for callers that
 * have already booted the kernel.
 */

import { KERNEL_VERSION, OCCT_PACKAGE_VERSION } from '@cad/kernel';

import { CLI_VERSION } from '../version.js';

export interface VersionInfo {
  readonly cad: string;
  readonly kernel: string;
  readonly occt: string;
  readonly node: string;
}

/** Capture a snapshot of the currently-running stack versions. */
export function getVersionInfo(): VersionInfo {
  return {
    cad: CLI_VERSION,
    kernel: KERNEL_VERSION,
    occt: `replicad-opencascadejs@${OCCT_PACKAGE_VERSION}`,
    node: process.version,
  };
}

/** Render as a fixed-width aligned table for human eyes. */
export function formatHuman(info: VersionInfo): string {
  return [
    `cad           ${info.cad}`,
    `@cad/kernel   ${info.kernel}`,
    `occt          ${info.occt}`,
    `node          ${info.node}`,
  ].join('\n');
}

/** Render as pretty JSON for tooling. */
export function formatJson(info: VersionInfo): string {
  return JSON.stringify(info, null, 2);
}

/**
 * `@cad/kernel` — industrial B-rep geometry kernel for the CAD monorepo.
 *
 * Thin TypeScript wrapper around `replicad` + `replicad-opencascadejs` (OCCT
 * compiled to WebAssembly). See `README.md` for usage.
 */

export { initOCCT, getOccVersion } from './occt.js';
export type { InitOCCTOptions } from './occt.js';

export { createBox } from './tessellate.js';

export { tessellationHash } from './hash.js';

export { KERNEL_VERSION, OCCT_PACKAGE_VERSION } from './version.js';

export type { BoundingBox, BoxInput, TessellationMetadata, TessellationResult } from './types.js';

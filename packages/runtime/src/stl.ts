import { tessellationToStl } from '@cad/kernel';

import { runtimeError } from './errors.js';

import type { RuntimeBuildResult } from './types.js';

export function exportBuildResultAsStl(result: RuntimeBuildResult): Uint8Array {
  if (result.tessellation === null) {
    throw runtimeError('runtime.no_exportable_solid', 'The current document build does not produce an exportable solid.', [
      {
        code: 'runtime.no_exportable_solid',
        message: 'The current document build does not produce an exportable solid.',
      },
    ]);
  }
  return tessellationToStl({
    positions: new Float32Array(result.tessellation.positions),
    normals: new Float32Array(result.tessellation.normals),
    indices: new Uint32Array(result.tessellation.indices),
    metadata: result.tessellation.metadata,
  });
}

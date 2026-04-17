import { createHash } from 'node:crypto';

import { evaluateExpression, evaluateParameters } from '@cad/expr';
import { createBox } from '@cad/kernel';

import { runtimeError } from './errors.js';

import type { JsonTessellation, RuntimeBuildResult, RuntimeFeatureResult } from './types.js';
import type { DocumentDefinition, ScalarInput } from '@cad/sdk';

export async function buildDocument(document: DocumentDefinition): Promise<RuntimeBuildResult> {
  const evaluated = evaluateParameters(document.parameters.entries);
  const featureCache = new Map<string, RuntimeFeatureResult>();
  let tessellation: JsonTessellation | undefined;
  const features: RuntimeFeatureResult[] = [];

  for (const feature of document.body.features) {
    if (feature.kind === 'sketch') {
      const inputHash = hashJson({ id: feature.id ?? 'sketch', kind: feature.kind, plane: feature.plane ?? 'xy' });
      const result = { id: feature.id ?? 'sketch', kind: feature.kind, inputHash, cached: false } satisfies RuntimeFeatureResult;
      featureCache.set(inputHash, result);
      features.push(result);
      continue;
    }
    const resolvedInput = {
      width: resolveScalar(feature.width, evaluated.values),
      depth: resolveScalar(feature.depth, evaluated.values),
      height: resolveScalar(feature.height, evaluated.values),
    };
    const inputHash = hashJson({ id: feature.id ?? 'pad', kind: feature.kind, input: resolvedInput });
    const cached = featureCache.has(inputHash);
    const featureResult = {
      id: feature.id ?? 'pad',
      kind: feature.kind,
      inputHash,
      cached,
    } satisfies RuntimeFeatureResult;
    features.push(featureResult);
    featureCache.set(inputHash, featureResult);
    const shape = await createBox(resolvedInput);
    tessellation = {
      positions: [...shape.positions],
      normals: [...shape.normals],
      indices: [...shape.indices],
      metadata: shape.metadata,
    };
  }

  if (tessellation === undefined) {
    throw runtimeError('runtime.no_tessellation', 'buildDocument: document produced no tessellation.', [
      {
        code: 'runtime.no_tessellation',
        message: 'buildDocument: document produced no tessellation.',
      },
    ]);
  }

  return {
    documentHash: hashJson({
      parameters: evaluated.order.map((name) => [name, evaluated.values[name]]),
      features,
      tessellationHash: tessellation.metadata.hash,
    }),
    parameters: evaluated.values,
    parameterOrder: evaluated.order,
    features,
    tessellation,
  };
}

function resolveScalar(
  scalar: ScalarInput,
  parameters: RuntimeBuildResult['parameters'],
): number {
  switch (scalar.kind) {
    case 'literal': {
      return assertMillimetres(scalar.unit, scalar.value);
    }
    case 'reference': {
      const resolved = parameters[scalar.name];
      if (resolved === undefined) {
        throw runtimeError(
          'runtime.unknown_parameter',
          `Unknown parameter "${scalar.name}" in feature input.`,
          [
            {
              code: 'runtime.unknown_parameter',
              message: `Unknown parameter "${scalar.name}" in feature input.`,
              context: { parameter: scalar.name },
            },
          ],
        );
      }
      return assertMillimetres(resolved.unit, resolved.value);
    }
    case 'expression': {
      const evaluated = evaluateExpression(
        scalar.source,
        Object.fromEntries(
          Object.entries(parameters).map(([name, value]) => [name, { value: value.value, unit: value.unit }]),
        ),
      );
      return assertMillimetres(evaluated.unit, evaluated.value);
    }
  }
}

function assertMillimetres(unit: string, value: number): number {
  if (unit !== 'mm') {
    throw runtimeError('runtime.invalid_geometry_unit', `Expected millimetre input for geometry, received ${unit}.`, [
      {
        code: 'runtime.invalid_geometry_unit',
        message: `Expected millimetre input for geometry, received ${unit}.`,
        context: { unit },
      },
    ]);
  }
  return value;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

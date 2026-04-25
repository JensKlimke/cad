import { createHash } from 'node:crypto';

import { evaluateExpression, evaluateParameters } from '@cad/expr';
import { createPadFromRectangleSketch } from '@cad/kernel';
import { parseSketchSvg, solveRectangleSketch } from '@cad/sketch';

import { runtimeError } from './errors.js';

import type { JsonTessellation, RuntimeBuildResult, RuntimeFeatureResult } from './types.js';
import type { DocumentDefinition, ScalarInput } from '@cad/sdk';

export async function buildDocument(document: DocumentDefinition): Promise<RuntimeBuildResult> {
  const evaluated = evaluateParameters(document.parameters.entries);
  const featureCache = new Map<string, RuntimeFeatureResult>();
  const solvedSketches = new Map<string, RuntimeFeatureResult & { readonly kind: 'sketch' }>();
  let tessellation: JsonTessellation | null = null;
  const features: RuntimeFeatureResult[] = [];

  for (const feature of document.body.features) {
    if (feature.kind === 'sketch') {
      const solved = await solveRectangleSketch(
        {
          plane: feature.plane,
          geometry: parseSketchSvg(feature.svg),
          constraints: feature.constraints,
        },
        {
          parameters: evaluated.values,
        },
      );
      const inputHash = hashJson({
        id: feature.id ?? 'sketch',
        kind: feature.kind,
        plane: feature.plane,
        svg: solved.svg,
        constraints: feature.constraints,
      });
      const result = {
        id: feature.id ?? 'sketch',
        kind: 'sketch',
        inputHash,
        cached: featureCache.has(inputHash),
        sketch: solved,
      } satisfies RuntimeFeatureResult;
      featureCache.set(inputHash, result);
      solvedSketches.set(result.id, result);
      features.push(result);
      continue;
    }

    const sketchId = feature.sketch.id;
    const sketch = solvedSketches.get(sketchId);
    if (sketch === undefined) {
      throw runtimeError(
        'runtime.missing_feature_reference',
        `Pad feature "${feature.id ?? 'pad'}" references missing sketch "${sketchId}".`,
        [
          {
            code: 'runtime.missing_feature_reference',
            message: `Pad feature "${feature.id ?? 'pad'}" references missing sketch "${sketchId}".`,
            context: { feature: feature.id ?? 'pad', reference: sketchId },
          },
        ],
      );
    }
    if (sketch.sketch.status === 'over_constrained') {
      throw runtimeError(
        'runtime.invalid_sketch',
        `Sketch "${sketchId}" is over-constrained and cannot be padded.`,
        sketch.sketch.diagnostics.map((message) => ({
          code: 'runtime.invalid_sketch',
          message,
          context: { sketch: sketchId },
        })),
      );
    }
    const resolvedInput = {
      sketch: sketchId,
      plane: sketch.sketch.plane,
      x: sketch.sketch.geometry.x,
      y: sketch.sketch.geometry.y,
      width: sketch.sketch.geometry.width,
      height: sketch.sketch.geometry.height,
      length: resolveScalar(feature.length, evaluated.values),
      direction: feature.direction,
    };
    const inputHash = hashJson({ id: feature.id ?? 'pad', kind: feature.kind, input: resolvedInput });
    const featureResult = {
      id: feature.id ?? 'pad',
      kind: 'pad',
      inputHash,
      cached: featureCache.has(inputHash),
      pad: {
        sketch: sketchId,
        length: resolvedInput.length,
        direction: feature.direction,
      },
    } satisfies RuntimeFeatureResult;
    features.push(featureResult);
    featureCache.set(inputHash, featureResult);
    const shape = await createPadFromRectangleSketch({
      plane: resolvedInput.plane,
      x: resolvedInput.x,
      y: resolvedInput.y,
      width: resolvedInput.width,
      height: resolvedInput.height,
      length: resolvedInput.length,
      direction: resolvedInput.direction,
    });
    tessellation = {
      positions: [...shape.positions],
      normals: [...shape.normals],
      indices: [...shape.indices],
      metadata: shape.metadata,
    };
  }

  return {
    documentHash: hashJson({
      parameters: evaluated.order.map((name) => [name, evaluated.values[name]]),
      features,
      tessellationHash: tessellation?.metadata.hash ?? null,
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

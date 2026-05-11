import { createHash } from 'node:crypto';

import { evaluateExpression, evaluateParameters } from '@cad/expr';
import { createPadFromRectangleSketch } from '@cad/kernel';
import { createEntityHash, type Topology, type TopologyEntity } from '@cad/references';
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
  const topology: TopologyEntity[] = [];

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
      topology.push(
        createSketchEntity(result.id, solved.plane, solved.geometry.width, solved.geometry.height),
      );
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
    const inputHash = hashJson({
      id: feature.id ?? 'pad',
      kind: feature.kind,
      input: resolvedInput,
    });
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
    topology.push(...createPadTopology(feature.id ?? 'pad', resolvedInput));
  }

  const runtimeTopology: Topology = { entities: topology };
  return {
    documentHash: hashJson({
      parameters: evaluated.order.map((name) => [name, evaluated.values[name]]),
      features,
      topology: runtimeTopology.entities.map((entity) => [
        entity.constructionPath,
        entity.hash.value,
      ]),
      tessellationHash: tessellation?.metadata.hash ?? null,
    }),
    parameters: evaluated.values,
    parameterOrder: evaluated.order,
    features,
    topology: runtimeTopology,
    tessellation,
  };
}

function createSketchEntity(
  featureId: string,
  plane: 'xy' | 'yz' | 'xz',
  width: number,
  height: number,
): TopologyEntity {
  const centroid: [number, number, number] = sketchCentroid(plane, width, height);
  const normal: [number, number, number] = sketchNormal(plane);
  const input = {
    kind: 'sketch' as const,
    featureId,
    constructionPath: `${featureId}.sketch.plane`,
    centroid,
    normal,
    area: width * height,
  };
  return {
    id: input.constructionPath,
    label: `Sketch plane ${featureId}`,
    ...input,
    hash: createEntityHash(input),
  };
}

function createPadTopology(
  featureId: string,
  input: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly length: number;
    readonly direction: 'up' | 'down' | 'symmetric';
  },
): readonly TopologyEntity[] {
  const [zMin, zMax] = padZRange(input.length, input.direction);
  const xMin = input.x;
  const xMax = input.x + input.width;
  const yMin = input.y;
  const yMax = input.y + input.height;
  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const zMid = (zMin + zMax) / 2;

  return [
    face(
      featureId,
      'bottom',
      'Bottom face',
      [xMid, yMid, zMin],
      [0, 0, -1],
      input.width * input.height,
      [zMin, zMin],
    ),
    face(featureId, 'top', 'Top face', [xMid, yMid, zMax], [0, 0, 1], input.width * input.height, [
      zMax,
      zMax,
    ]),
    face(
      featureId,
      'xMin',
      'Left face',
      [xMin, yMid, zMid],
      [-1, 0, 0],
      input.height * input.length,
      [zMin, zMax],
    ),
    face(
      featureId,
      'xMax',
      'Right face',
      [xMax, yMid, zMid],
      [1, 0, 0],
      input.height * input.length,
      [zMin, zMax],
    ),
    face(
      featureId,
      'yMin',
      'Front face',
      [xMid, yMin, zMid],
      [0, -1, 0],
      input.width * input.length,
      [zMin, zMax],
    ),
    face(
      featureId,
      'yMax',
      'Back face',
      [xMid, yMax, zMid],
      [0, 1, 0],
      input.width * input.length,
      [zMin, zMax],
    ),
  ];
}

function sketchCentroid(
  plane: 'xy' | 'yz' | 'xz',
  width: number,
  height: number,
): [number, number, number] {
  switch (plane) {
    case 'xy': {
      return [width / 2, height / 2, 0];
    }
    case 'yz': {
      return [0, width / 2, height / 2];
    }
    case 'xz': {
      return [width / 2, 0, height / 2];
    }
  }
}

function sketchNormal(plane: 'xy' | 'yz' | 'xz'): [number, number, number] {
  switch (plane) {
    case 'xy': {
      return [0, 0, 1];
    }
    case 'yz': {
      return [1, 0, 0];
    }
    case 'xz': {
      return [0, 1, 0];
    }
  }
}

function padZRange(length: number, direction: 'up' | 'down' | 'symmetric'): [number, number] {
  switch (direction) {
    case 'symmetric': {
      return [-length / 2, length / 2];
    }
    case 'down': {
      return [-length, 0];
    }
    case 'up': {
      return [0, length];
    }
  }
}

function face(
  featureId: string,
  name: string,
  label: string,
  centroid: [number, number, number],
  normal: [number, number, number],
  area: number,
  zRange: [number, number],
): TopologyEntity {
  const input = {
    kind: 'face' as const,
    featureId,
    constructionPath: `${featureId}.face.${name}`,
    centroid,
    normal,
    area,
    zRange,
  };
  return {
    id: input.constructionPath,
    label,
    ...input,
    hash: createEntityHash(input),
  };
}

function resolveScalar(scalar: ScalarInput, parameters: RuntimeBuildResult['parameters']): number {
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
          Object.entries(parameters).map(([name, value]) => [
            name,
            { value: value.value, unit: value.unit },
          ]),
        ),
      );
      return assertMillimetres(evaluated.unit, evaluated.value);
    }
  }
}

function assertMillimetres(unit: string, value: number): number {
  if (unit !== 'mm') {
    throw runtimeError(
      'runtime.invalid_geometry_unit',
      `Expected millimetre input for geometry, received ${unit}.`,
      [
        {
          code: 'runtime.invalid_geometry_unit',
          message: `Expected millimetre input for geometry, received ${unit}.`,
          context: { unit },
        },
      ],
    );
  }
  return value;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

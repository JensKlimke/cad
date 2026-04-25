import { evaluateExpression, type Quantity } from '@cad/expr';
import {
  GcsWrapper,
  SolveStatus,
  init_planegcs_module,
  type Constraint,
  type ModuleStatic,
  type SketchPrimitive,
} from '@salusoft89/planegcs';

export type SketchPlane = 'xy' | 'yz' | 'xz';
export type SketchConstraintStatus = 'under_constrained' | 'fully_constrained' | 'over_constrained';

export interface SketchLiteralValue {
  readonly kind: 'literal';
  readonly value: number;
  readonly unit: 'mm';
}

export interface SketchReferenceValue {
  readonly kind: 'reference';
  readonly name: string;
}

export interface SketchExpressionValue {
  readonly kind: 'expression';
  readonly source: string;
  readonly unit: 'mm';
}

export type SketchConstraintValue = SketchLiteralValue | SketchReferenceValue | SketchExpressionValue;

export interface RectangleSketchGeometry {
  readonly kind: 'rectangle';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RectangleSketchConstraints {
  readonly kind: 'rectangle';
  readonly anchor: 'origin';
  readonly width: SketchConstraintValue;
  readonly height: SketchConstraintValue;
}

export type SketchConstraints = RectangleSketchConstraints;

export interface RectangleSketchDefinition {
  readonly plane: SketchPlane;
  readonly geometry: RectangleSketchGeometry;
  readonly constraints: RectangleSketchConstraints;
}

export interface SolvedSketchArtifact {
  readonly plane: SketchPlane;
  readonly svg: string;
  readonly constraints: RectangleSketchConstraints;
  readonly geometry: RectangleSketchGeometry;
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
  };
  readonly status: SketchConstraintStatus;
  readonly diagnostics: readonly string[];
}

export interface SolveSketchOptions {
  readonly wasmUrl?: string;
  readonly parameters?: Readonly<Record<string, Quantity>>;
}

let cachedModulePromise: Promise<ModuleStatic> | null = null;

/**
 * Slice 5 persists one canonical rectangle-first SVG payload.
 */
export function serializeSketchSvg(definition: RectangleSketchDefinition): string {
  const { geometry, plane } = definition;
  const width = roundCoordinate(Math.max(geometry.width, 1));
  const height = roundCoordinate(Math.max(geometry.height, 1));
  const x = roundCoordinate(geometry.x);
  const y = roundCoordinate(geometry.y);
  const viewBoxX = roundCoordinate(Math.min(0, x) - 20);
  const viewBoxY = roundCoordinate(Math.min(0, y) - 20);
  const viewBoxWidth = roundCoordinate(Math.max(x + width, width) - viewBoxX + 20);
  const viewBoxHeight = roundCoordinate(Math.max(y + height, height) - viewBoxY + 20);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" data-cad-plane="${plane}" data-cad-kind="rectangle">`,
    `  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="1" />`,
    '</svg>',
  ].join('');
}

export function parseSketchSvg(svg: string): RectangleSketchGeometry {
  const rectMatch = svg.match(/<rect\b([^>]*)\/?>/);
  if (rectMatch === null) {
    throw new Error('parseSketchSvg: expected a persisted <rect> element.');
  }
  const attributes = rectMatch[1] ?? '';
  return {
    kind: 'rectangle',
    x: parseSvgNumber(attributes, 'x'),
    y: parseSvgNumber(attributes, 'y'),
    width: parseSvgNumber(attributes, 'width'),
    height: parseSvgNumber(attributes, 'height'),
  };
}

export function createRectangleSketch(input?: Partial<RectangleSketchDefinition>): RectangleSketchDefinition {
  const geometry: RectangleSketchGeometry = {
    kind: 'rectangle',
    x: input?.geometry?.x ?? 0,
    y: input?.geometry?.y ?? 0,
    width: input?.geometry?.width ?? 80,
    height: input?.geometry?.height ?? 50,
  };
  return {
    plane: input?.plane ?? 'xy',
    geometry,
    constraints: input?.constraints ?? {
      kind: 'rectangle',
      anchor: 'origin',
      width: { kind: 'literal', value: geometry.width, unit: 'mm' },
      height: { kind: 'literal', value: geometry.height, unit: 'mm' },
    },
  };
}

export async function solveRectangleSketch(
  definition: RectangleSketchDefinition,
  options: SolveSketchOptions = {},
): Promise<SolvedSketchArtifact> {
  const requestedWidth = resolveSketchValue(
    definition.constraints.width,
    options.parameters,
    definition.geometry.width,
  );
  const requestedHeight = resolveSketchValue(
    definition.constraints.height,
    options.parameters,
    definition.geometry.height,
  );
  if (!Number.isFinite(requestedWidth) || !Number.isFinite(requestedHeight) || requestedWidth <= 0 || requestedHeight <= 0) {
    return {
      plane: definition.plane,
      svg: serializeSketchSvg(definition),
      constraints: definition.constraints,
      geometry: definition.geometry,
      dimensions: {
        width: requestedWidth,
        height: requestedHeight,
      },
      status: 'over_constrained',
      diagnostics: ['Sketch rectangle dimensions must resolve to positive millimetre values.'],
    };
  }

  const module = await getPlanegcsModule(options.wasmUrl);
  const gcs = new module.GcsSystem();
  const wrapper = new GcsWrapper(gcs);
  try {
    wrapper.push_primitives_and_params(createRectanglePrimitives(definition.geometry, requestedWidth, requestedHeight));
    const solveStatus = wrapper.solve();
    wrapper.apply_solution();
    const diagnostics = collectDiagnostics(wrapper, solveStatus);
    const status = classifySolveStatus(wrapper, solveStatus, definition.geometry, requestedWidth, requestedHeight);
    const geometry = readSolvedGeometry(wrapper);
    const normalized: RectangleSketchDefinition = {
      plane: definition.plane,
      geometry,
      constraints: definition.constraints,
    };
    return {
      plane: definition.plane,
      svg: serializeSketchSvg(normalized),
      constraints: definition.constraints,
      geometry,
      dimensions: {
        width: geometry.width,
        height: geometry.height,
      },
      status,
      diagnostics,
    };
  } finally {
    wrapper.destroy_gcs_module();
  }
}

export function resolveSketchValue(
  value: SketchConstraintValue,
  parameters: Readonly<Record<string, Quantity>> | undefined,
  fallback: number,
): number {
  switch (value.kind) {
    case 'literal': {
      return value.value;
    }
    case 'reference': {
      const resolved = parameters?.[value.name];
      if (resolved === undefined) {
        return fallback;
      }
      if (resolved.unit !== 'mm') {
        throw new Error(`resolveSketchValue: expected millimetre parameter "${value.name}", received ${resolved.unit}.`);
      }
      return resolved.value;
    }
    case 'expression': {
      const evaluated = evaluateExpression(
        value.source,
        Object.fromEntries(
          Object.entries(parameters ?? {}).map(([name, quantity]) => [name, { value: quantity.value, unit: quantity.unit }]),
        ),
      );
      if (evaluated.unit !== 'mm') {
        throw new Error(`resolveSketchValue: expected millimetre expression result, received ${evaluated.unit}.`);
      }
      return evaluated.value;
    }
  }
}

async function getPlanegcsModule(wasmUrl?: string): Promise<ModuleStatic> {
  if (cachedModulePromise === null) {
    cachedModulePromise = init_planegcs_module(
      wasmUrl === undefined
        ? undefined
        : {
            locateFile: () => wasmUrl,
          },
    );
  }
  return cachedModulePromise;
}

function createRectanglePrimitives(
  geometry: RectangleSketchGeometry,
  width: number,
  height: number,
): (SketchPrimitive | { readonly type: 'param'; readonly name: string; readonly value: number })[] {
  const x = roundCoordinate(geometry.x);
  const y = roundCoordinate(geometry.y);
  const topX = roundCoordinate(x + width);
  const topY = roundCoordinate(y + height);
  const primitives: SketchPrimitive[] = [
    { id: 'p1', type: 'point', x, y, fixed: false },
    { id: 'p2', type: 'point', x: topX, y, fixed: false },
    { id: 'p3', type: 'point', x: topX, y: topY, fixed: false },
    { id: 'p4', type: 'point', x, y: topY, fixed: false },
    { id: 'l1', type: 'line', p1_id: 'p1', p2_id: 'p2' },
    { id: 'l2', type: 'line', p1_id: 'p2', p2_id: 'p3' },
    { id: 'l3', type: 'line', p1_id: 'p3', p2_id: 'p4' },
    { id: 'l4', type: 'line', p1_id: 'p4', p2_id: 'p1' },
    { id: 'c1', type: 'horizontal_l', l_id: 'l1' } satisfies Constraint,
    { id: 'c2', type: 'vertical_l', l_id: 'l2' } satisfies Constraint,
    { id: 'c3', type: 'horizontal_l', l_id: 'l3' } satisfies Constraint,
    { id: 'c4', type: 'vertical_l', l_id: 'l4' } satisfies Constraint,
    { id: 'c5', type: 'coordinate_x', p_id: 'p1', x } satisfies Constraint,
    { id: 'c6', type: 'coordinate_y', p_id: 'p1', y } satisfies Constraint,
    { id: 'c7', type: 'p2p_distance', p1_id: 'p1', p2_id: 'p2', distance: width } satisfies Constraint,
    { id: 'c8', type: 'p2p_distance', p1_id: 'p2', p2_id: 'p3', distance: height } satisfies Constraint,
  ];
  return primitives;
}

function readSolvedGeometry(wrapper: GcsWrapper): RectangleSketchGeometry {
  const p1 = wrapper.sketch_index.get_sketch_point('p1');
  const p2 = wrapper.sketch_index.get_sketch_point('p2');
  const p4 = wrapper.sketch_index.get_sketch_point('p4');
  const x = roundCoordinate(Math.min(p1.x, p2.x, p4.x));
  const y = roundCoordinate(Math.min(p1.y, p2.y, p4.y));
  return {
    kind: 'rectangle',
    x,
    y,
    width: roundCoordinate(Math.abs(p2.x - p1.x)),
    height: roundCoordinate(Math.abs(p4.y - p1.y)),
  };
}

function classifySolveStatus(
  wrapper: GcsWrapper,
  solveStatus: number,
  geometry: RectangleSketchGeometry,
  width: number,
  height: number,
): SketchConstraintStatus {
  if (
    wrapper.has_gcs_conflicting_constraints()
    || wrapper.has_gcs_redundant_constraints()
    || wrapper.has_gcs_partially_redundant_constraints()
    || solveStatus === SolveStatus.Failed
    || solveStatus === SolveStatus.SuccessfulSolutionInvalid
  ) {
    return 'over_constrained';
  }
  if (geometry.width <= 0 || geometry.height <= 0 || width <= 0 || height <= 0) {
    return 'under_constrained';
  }
  return 'fully_constrained';
}

function collectDiagnostics(wrapper: GcsWrapper, solveStatus: number): readonly string[] {
  const diagnostics: string[] = [];
  if (solveStatus === SolveStatus.Failed) {
    diagnostics.push('PlaneGCS failed to solve the rectangle sketch.');
  }
  if (solveStatus === SolveStatus.SuccessfulSolutionInvalid) {
    diagnostics.push('PlaneGCS returned an invalid solution for the rectangle sketch.');
  }
  const conflicts = wrapper.get_gcs_conflicting_constraints();
  if (conflicts.length > 0) {
    diagnostics.push(`Conflicting constraints: ${conflicts.join(', ')}`);
  }
  const redundant = wrapper.get_gcs_redundant_constraints();
  if (redundant.length > 0) {
    diagnostics.push(`Redundant constraints: ${redundant.join(', ')}`);
  }
  const partial = wrapper.get_gcs_partially_redundant_constraints();
  if (partial.length > 0) {
    diagnostics.push(`Partially redundant constraints: ${partial.join(', ')}`);
  }
  return diagnostics;
}

function parseSvgNumber(attributes: string, name: string): number {
  const match = attributes.match(new RegExp(`${name}="([^"]+)"`));
  if (match === null) {
    throw new Error(`parseSketchSvg: missing "${name}" on persisted rectangle.`);
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`parseSketchSvg: invalid "${name}" value "${match[1]}".`);
  }
  return parsed;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}

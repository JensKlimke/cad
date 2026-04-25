import type { ParameterDefinition, Unit } from '@cad/expr';
import type { RectangleSketchConstraints, SketchPlane } from '@cad/sketch';
export { docMetadata, ops, type SdkOpDocMetadata, type SdkOpId } from './ops.js';

export interface ParameterCollection {
  readonly kind: 'parameters';
  readonly entries: Readonly<Record<string, ParameterDefinition>>;
}

export interface ScalarLiteral {
  readonly kind: 'literal';
  readonly value: number;
  readonly unit: Unit;
}

export interface ScalarExpression {
  readonly kind: 'expression';
  readonly source: string;
  readonly unit: Unit;
}

export interface ScalarReference {
  readonly kind: 'reference';
  readonly name: string;
}

export type ScalarInput = ScalarLiteral | ScalarExpression | ScalarReference;

export interface FeatureReference {
  readonly kind: 'feature';
  readonly id: string;
}

export type PadDirection = 'up' | 'down' | 'symmetric';

export interface PadFeature {
  readonly kind: 'pad';
  readonly id?: string;
  readonly sketch: FeatureReference;
  readonly length: ScalarInput;
  readonly direction: PadDirection;
}

export interface SketchFeature {
  readonly kind: 'sketch';
  readonly id?: string;
  readonly plane: SketchPlane;
  readonly svg: string;
  readonly constraints: RectangleSketchConstraints;
}

export type Feature = PadFeature | SketchFeature;

export interface BodyDefinition {
  readonly kind: 'body';
  readonly features: readonly Feature[];
}

export interface DocumentDefinition {
  readonly kind: 'document';
  readonly parameters: ParameterCollection;
  readonly body: BodyDefinition;
}

export function parameters(entries: Readonly<Record<string, ParameterDefinition>>): ParameterCollection {
  return {
    kind: 'parameters',
    entries,
  };
}

export function body(features: readonly Feature[]): BodyDefinition {
  return {
    kind: 'body',
    features,
  };
}

export function pad(input: {
  readonly id?: string;
  readonly sketch: FeatureReference | string;
  readonly length: ScalarInput | number | string;
  readonly direction?: PadDirection;
}): PadFeature {
  return {
    kind: 'pad',
    ...(input.id === undefined ? {} : { id: input.id }),
    sketch: normalizeFeatureReference(input.sketch),
    length: normalizeScalarInput(input.length),
    direction: input.direction ?? 'up',
  };
}

export function sketch(input: {
  readonly id?: string;
  readonly plane?: SketchPlane;
  readonly svg: string;
  readonly constraints: RectangleSketchConstraints;
}): SketchFeature {
  return {
    kind: 'sketch',
    ...(input.id === undefined ? {} : { id: input.id }),
    plane: input.plane ?? 'xy',
    svg: input.svg,
    constraints: input.constraints,
  };
}

export function defineDocument(input: {
  readonly parameters: ParameterCollection;
  readonly body: BodyDefinition;
}): DocumentDefinition {
  return {
    kind: 'document',
    parameters: input.parameters,
    body: input.body,
  };
}

export function literal(value: number, unit: Unit): ScalarLiteral {
  return { kind: 'literal', value, unit };
}

export function expression(source: string, unit: Unit): ScalarExpression {
  return { kind: 'expression', source, unit };
}

export function reference(name: string): ScalarReference {
  return { kind: 'reference', name };
}

export function feature(id: string): FeatureReference {
  return { kind: 'feature', id };
}

function normalizeScalarInput(input: ScalarInput | number | string): ScalarInput {
  if (typeof input === 'number') {
    return literal(input, 'mm');
  }
  if (typeof input === 'string') {
    return reference(input);
  }
  return input;
}

function normalizeFeatureReference(input: FeatureReference | string): FeatureReference {
  if (typeof input === 'string') {
    return feature(input);
  }
  return input;
}

export type { ParameterDefinition, Unit } from '@cad/expr';
export type { RectangleSketchConstraints, SketchConstraintValue, SketchPlane } from '@cad/sketch';

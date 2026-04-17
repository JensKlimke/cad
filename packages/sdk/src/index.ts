import type { ParameterDefinition, Unit } from '@cad/expr';

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

export interface PadFeature {
  readonly kind: 'pad';
  readonly id?: string;
  readonly width: ScalarInput;
  readonly depth: ScalarInput;
  readonly height: ScalarInput;
}

export interface SketchFeature {
  readonly kind: 'sketch';
  readonly id?: string;
  readonly plane?: 'xy' | 'yz' | 'xz';
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

export interface DocMetadata {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export const docMetadata = {
  defineDocument: {
    id: 'defineDocument',
    title: 'Define document',
    description: 'Create the canonical executable TypeScript document definition.',
  },
  parameters: {
    id: 'parameters',
    title: 'Parameters',
    description: 'Declare typed document parameters and expressions.',
  },
  body: {
    id: 'body',
    title: 'Body',
    description: 'Declare an ordered feature body for evaluation.',
  },
  pad: {
    id: 'pad',
    title: 'Pad',
    description: 'Create a box-like solid from width, depth, and height inputs.',
  },
  sketch: {
    id: 'sketch',
    title: 'Sketch',
    description: 'Declare a sketch feature placeholder for later slices.',
  },
} as const satisfies Readonly<Record<string, DocMetadata>>;

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
  readonly width: ScalarInput | number | string;
  readonly depth: ScalarInput | number | string;
  readonly height: ScalarInput | number | string;
}): PadFeature {
  return {
    kind: 'pad',
    ...(input.id === undefined ? {} : { id: input.id }),
    width: normalizeScalarInput(input.width),
    depth: normalizeScalarInput(input.depth),
    height: normalizeScalarInput(input.height),
  };
}

export function sketch(input: { readonly id?: string; readonly plane?: 'xy' | 'yz' | 'xz' } = {}): SketchFeature {
  return {
    kind: 'sketch',
    ...(input.id === undefined ? {} : { id: input.id }),
    ...(input.plane === undefined ? {} : { plane: input.plane }),
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

function normalizeScalarInput(input: ScalarInput | number | string): ScalarInput {
  if (typeof input === 'number') {
    return literal(input, 'mm');
  }
  if (typeof input === 'string') {
    return reference(input);
  }
  return input;
}

export type { ParameterDefinition, Unit } from '@cad/expr';

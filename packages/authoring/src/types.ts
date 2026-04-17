import type { ParameterDefinition, Unit } from '@cad/sdk';

export interface ScalarAstLiteral {
  readonly kind: 'literal';
  readonly value: number;
  readonly unit: Unit;
}

export interface ScalarAstReference {
  readonly kind: 'reference';
  readonly name: string;
}

export interface ScalarAstExpression {
  readonly kind: 'expression';
  readonly source: string;
  readonly unit: Unit;
}

export type ScalarAstInput = ScalarAstLiteral | ScalarAstReference | ScalarAstExpression;

export interface PadFeatureAst {
  readonly kind: 'pad';
  readonly id: string;
  readonly width: ScalarAstInput;
  readonly depth: ScalarAstInput;
  readonly height: ScalarAstInput;
}

export interface SketchFeatureAst {
  readonly kind: 'sketch';
  readonly id: string;
  readonly plane?: 'xy' | 'yz' | 'xz';
}

export type FeatureAst = PadFeatureAst | SketchFeatureAst;

export interface ParameterAst {
  readonly name: string;
  readonly definition: ParameterDefinition;
}

export interface DocumentAST {
  readonly parameters: readonly ParameterAst[];
  readonly features: readonly FeatureAst[];
}

export type AuthoringOp =
  | { readonly kind: 'parameter.add'; readonly name: string; readonly definition: ParameterDefinition }
  | { readonly kind: 'parameter.update'; readonly name: string; readonly definition: ParameterDefinition }
  | { readonly kind: 'parameter.remove'; readonly name: string }
  | { readonly kind: 'parameter.rename'; readonly name: string; readonly newName: string }
  | { readonly kind: 'feature.add'; readonly feature: FeatureAst; readonly index?: number }
  | { readonly kind: 'feature.update'; readonly id: string; readonly feature: FeatureAst }
  | { readonly kind: 'feature.remove'; readonly id: string }
  | { readonly kind: 'feature.reorder'; readonly id: string; readonly index: number };

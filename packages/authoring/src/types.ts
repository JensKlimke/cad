import type { SourceRange } from '@cad/expr';
import type { ParameterDefinition, Unit } from '@cad/sdk';
import type { RectangleSketchConstraints, RectangleSketchGeometry, SketchPlane } from '@cad/sketch';

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

export interface ParameterAst {
  readonly id: string;
  readonly name: string;
  readonly definition: ParameterDefinition;
  readonly range?: SourceRange;
  readonly nameRange?: SourceRange;
  readonly definitionRange?: SourceRange;
}

export interface ParameterAstInput {
  readonly id?: string;
  readonly name: string;
  readonly definition: ParameterDefinition;
}

export interface PadFeatureAst {
  readonly kind: 'pad';
  readonly id: string;
  readonly sketch: string;
  readonly length: ScalarAstInput;
  readonly direction: 'up' | 'down' | 'symmetric';
  readonly range?: SourceRange;
  readonly fieldRanges?: {
    readonly id?: SourceRange;
    readonly sketch?: SourceRange;
    readonly length?: SourceRange;
    readonly direction?: SourceRange;
  };
}

export interface SketchFeatureAst {
  readonly kind: 'sketch';
  readonly id: string;
  readonly plane: SketchPlane;
  readonly svg: string;
  readonly geometry: RectangleSketchGeometry;
  readonly constraints: RectangleSketchConstraints;
  readonly range?: SourceRange;
  readonly fieldRanges?: {
    readonly id?: SourceRange;
    readonly plane?: SourceRange;
    readonly svg?: SourceRange;
    readonly constraints?: SourceRange;
  };
}

export type FeatureAst = PadFeatureAst | SketchFeatureAst;

export type FeatureAstInput =
  | Omit<PadFeatureAst, 'fieldRanges' | 'range'>
  | Omit<SketchFeatureAst, 'fieldRanges' | 'range'>;

export interface DocumentAST {
  readonly parameters: readonly ParameterAst[];
  readonly features: readonly FeatureAst[];
  readonly sections?: {
    readonly parameters?: SourceRange;
    readonly body?: SourceRange;
  };
}

export type AstNodeSelection =
  | { readonly kind: 'parameter'; readonly id: string }
  | { readonly kind: 'feature'; readonly id: string };

export type AuthoringOp =
  | { readonly kind: 'parameter.add'; readonly parameter: ParameterAstInput; readonly index?: number }
  | { readonly kind: 'parameter.update'; readonly id: string; readonly parameter: ParameterAstInput }
  | { readonly kind: 'parameter.remove'; readonly id: string }
  | { readonly kind: 'parameter.rename'; readonly id: string; readonly newName: string }
  | { readonly kind: 'feature.add'; readonly feature: FeatureAstInput; readonly index?: number }
  | { readonly kind: 'feature.update'; readonly id: string; readonly feature: FeatureAstInput }
  | { readonly kind: 'feature.remove'; readonly id: string }
  | { readonly kind: 'feature.reorder'; readonly id: string; readonly index: number };

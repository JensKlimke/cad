export const UNITS = ['mm', 'deg', 'rad', 'count'] as const;
export type Unit = (typeof UNITS)[number];

export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

export interface Quantity {
  readonly value: number;
  readonly unit: Unit;
}

export interface NumberParameterDefinition {
  readonly kind: 'number';
  readonly value: number;
  readonly unit: Unit;
}

export interface ExpressionParameterDefinition {
  readonly kind: 'expression';
  readonly expression: string;
  readonly unit: Unit;
}

export interface NumberParameterDefinitionShorthand {
  readonly value: number;
  readonly unit: Unit;
}

export interface ExpressionParameterDefinitionShorthand {
  readonly expression: string;
  readonly unit: Unit;
}

export type ParameterDefinition =
  | NumberParameterDefinition
  | ExpressionParameterDefinition
  | NumberParameterDefinitionShorthand
  | ExpressionParameterDefinitionShorthand;

export type BinaryOperator = '+' | '-' | '*' | '/';

export interface LiteralExprNode {
  readonly kind: 'literal';
  readonly value: number;
  readonly range: SourceRange;
}

export interface IdentifierExprNode {
  readonly kind: 'identifier';
  readonly name: string;
  readonly range: SourceRange;
}

export interface UnaryExprNode {
  readonly kind: 'unary';
  readonly operator: '+' | '-';
  readonly operand: ExprNode;
  readonly range: SourceRange;
}

export interface BinaryExprNode {
  readonly kind: 'binary';
  readonly operator: BinaryOperator;
  readonly left: ExprNode;
  readonly right: ExprNode;
  readonly range: SourceRange;
}

export type ExprNode = LiteralExprNode | IdentifierExprNode | UnaryExprNode | BinaryExprNode;

export interface ResolvedParameter {
  readonly name: string;
  readonly value: number;
  readonly unit: Unit;
  readonly source: ParameterDefinition;
}

export interface ParameterEvaluationResult {
  readonly values: Readonly<Record<string, ResolvedParameter>>;
  readonly order: readonly string[];
}

export interface ExprDiagnostic {
  readonly code:
    | 'expr.syntax'
    | 'expr.unknown_identifier'
    | 'expr.cycle'
    | 'expr.unit_mismatch'
    | 'expr.divide_by_zero';
  readonly message: string;
  readonly range?: SourceRange;
  readonly path?: readonly string[];
}

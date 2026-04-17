import type { ExprDiagnostic } from './types.js';

export class ExprError extends Error {
  public readonly diagnostic: ExprDiagnostic;

  constructor(diagnostic: ExprDiagnostic) {
    super(diagnostic.message);
    this.name = 'ExprError';
    this.diagnostic = diagnostic;
  }
}

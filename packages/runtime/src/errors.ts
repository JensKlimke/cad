import { ExprError, type ExprDiagnostic } from '@cad/expr';

import type { RuntimeDiagnostic } from './types.js';

export class RuntimeBuildError extends Error {
  public readonly code: string;
  public readonly diagnostics: readonly RuntimeDiagnostic[];

  constructor(code: string, message: string, diagnostics: readonly RuntimeDiagnostic[] = []) {
    super(message);
    this.name = 'RuntimeBuildError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function runtimeError(code: string, message: string, diagnostics: readonly RuntimeDiagnostic[] = []): RuntimeBuildError {
  return new RuntimeBuildError(code, message, diagnostics);
}

export function normalizeRuntimeError(error: unknown): RuntimeBuildError {
  if (error instanceof RuntimeBuildError) {
    return error;
  }
  if (error instanceof ExprError) {
    return runtimeError(error.diagnostic.code, error.message, [exprDiagnosticToRuntimeDiagnostic(error.diagnostic)]);
  }
  if (error instanceof Error) {
    return runtimeError('runtime.execution_failed', error.message, [
      {
        code: 'runtime.execution_failed',
        message: error.message,
      },
    ]);
  }
  const message = String(error);
  return runtimeError('runtime.execution_failed', message, [
    {
      code: 'runtime.execution_failed',
      message,
    },
  ]);
}

function exprDiagnosticToRuntimeDiagnostic(diagnostic: ExprDiagnostic): RuntimeDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    ...(diagnostic.range === undefined ? {} : { range: diagnostic.range }),
    ...(diagnostic.path === undefined ? {} : { path: [...diagnostic.path] }),
  };
}

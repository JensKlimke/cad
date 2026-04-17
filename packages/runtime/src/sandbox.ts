import vm from 'node:vm';

import * as sdk from '@cad/sdk';
import ts from 'typescript';

import { buildDocument } from './build.js';
import { normalizeRuntimeError, runtimeError } from './errors.js';

import type { RuntimeOptions, WorkerMessage } from './types.js';
import type { DocumentDefinition } from '@cad/sdk';

export interface WorkerRequest {
  readonly source: string;
  readonly options: Required<RuntimeOptions>;
}

export async function executeInSandbox(request: WorkerRequest): Promise<WorkerMessage> {
  try {
    assertSourceSafe(request.source);
    const compiled = ts.transpileModule(request.source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        strict: true,
      },
      reportDiagnostics: true,
    });
    const diagnostics = compiled.diagnostics ?? [];
    if (diagnostics.length > 0) {
      return {
        ok: false,
        error: {
          code: 'build.compile_failed',
          message: diagnostics
            .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
            .join('\n'),
          diagnostics: diagnostics.map((diagnostic) => ({
            code: 'build.compile_failed',
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            ...(diagnostic.start === undefined || diagnostic.length === undefined
              ? {}
              : {
                  range: {
                    start: diagnostic.start,
                    end: diagnostic.start + diagnostic.length,
                  },
                }),
          })),
        },
      };
    }

    const module = { exports: {} as Record<string, unknown> };
    const context = vm.createContext(
      {
        module,
        exports: module.exports,
        require: (specifier: string) => {
          if (specifier !== '@cad/sdk') {
            throw new Error(`Unsupported import "${specifier}".`);
          }
          return sdk;
        },
      },
      {
        codeGeneration: {
          strings: false,
          wasm: false,
        },
      },
    );
    const script = new vm.Script(compiled.outputText, {
      filename: 'document.cjs',
    });
    script.runInContext(context, { timeout: request.options.timeoutMs });
    const exported = (module.exports.default ?? module.exports) as DocumentDefinition | undefined;
    if (exported === undefined || typeof exported !== 'object' || exported.kind !== 'document') {
      throw new Error('Document module must export a default document definition created by defineDocument(...).');
    }
    const result = await buildDocument(exported);
    return { ok: true, result };
  } catch (error) {
    const normalized = normalizeRuntimeError(error);
    return {
      ok: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        diagnostics: normalized.diagnostics,
      },
    };
  }
}

export function assertSourceSafe(source: string): void {
  const file = ts.createSourceFile('document.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = statement.moduleSpecifier.getText(file).replaceAll(/['"]/gu, '');
      if (specifier !== '@cad/sdk') {
        throw runtimeError(
          'runtime.unsupported_import',
          `Only "@cad/sdk" imports are allowed in document.ts, received "${specifier}".`,
          [
            {
              code: 'runtime.unsupported_import',
              message: `Only "@cad/sdk" imports are allowed in document.ts, received "${specifier}".`,
              range: {
                start: statement.moduleSpecifier.getStart(file),
                end: statement.moduleSpecifier.getEnd(),
              },
              context: { specifier },
            },
          ],
        );
      }
      continue;
    }
    if (
      ts.isExpressionStatement(statement) ||
      ts.isExportAssignment(statement) ||
      ts.isVariableStatement(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      continue;
    }
    throw runtimeError('runtime.unsupported_toplevel', 'Unsupported top-level statement in document.ts sandbox.', [
      {
        code: 'runtime.unsupported_toplevel',
        message: 'Unsupported top-level statement in document.ts sandbox.',
        range: {
          start: statement.getStart(file),
          end: statement.getEnd(),
        },
      },
    ]);
  }
}

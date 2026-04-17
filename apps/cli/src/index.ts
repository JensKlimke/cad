/**
 * `cad` CLI entrypoint.
 *
 * Slice 0 surface: a single `version` subcommand (plus `--version` flag).
 * The default action — invoking `cad` with no arguments — also prints
 * version info, matching the convention that a fresh CLI should tell the
 * user what they just installed.
 *
 * The commander program is built in `createProgram` so it can be unit-tested
 * without spawning a subprocess. `main` wraps it with `process.argv` and
 * exit handling; the binary launcher in `bin/cad.js` just imports this file.
 */

import { readFile } from 'node:fs/promises';

import { executeDocument, RuntimeBuildError } from '@cad/runtime';
import { Command } from 'commander';

import { formatHuman, formatJson, getVersionInfo } from './commands/version.js';
import { CLI_VERSION } from './version.js';

interface VersionCommandOptions {
  readonly json?: boolean;
}

interface BuildCommandOptions {
  readonly timeoutMs?: string;
  readonly memoryMb?: string;
}

function printVersion(options: VersionCommandOptions): void {
  const info = getVersionInfo();
  process.stdout.write(`${options.json ? formatJson(info) : formatHuman(info)}\n`);
}

function formatBuildFailure(error: RuntimeBuildError): string {
  const diagnostics = error.diagnostics
    .map((diagnostic) => {
      const range =
        diagnostic.range === undefined
          ? ''
          : ` [${String(diagnostic.range.start)}-${String(diagnostic.range.end)}]`;
      return `  - ${diagnostic.code}${range}: ${diagnostic.message}`;
    })
    .join('\n');
  return diagnostics.length > 0 ? `${error.message}\n${diagnostics}` : error.message;
}

/**
 * Build (but do not execute) the commander program. Exposed for tests.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('cad')
    .description('AI-ready parametric CAD system')
    .version(CLI_VERSION, '-V, --version', 'output the CLI version');

  program
    .command('version')
    .description('Print version info for every layer of the stack')
    .option('--json', 'Output as JSON')
    .action((options: VersionCommandOptions) => {
      printVersion(options);
    });

  program
    .command('build')
    .description('Execute a document.ts file and emit deterministic tessellation JSON')
    .argument('<path>', 'Path to the document.ts source file')
    .option('--timeout-ms <number>', 'Runtime timeout in milliseconds', '5000')
    .option('--memory-mb <number>', 'Worker memory cap in megabytes', '128')
    .action(async (path: string, options: BuildCommandOptions) => {
      try {
        const source = await readFile(path, 'utf8');
        const result = await executeDocument(source, {
          timeoutMs: Number(options.timeoutMs ?? '5000'),
          memoryMb: Number(options.memoryMb ?? '128'),
        });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } catch (error) {
        if (error instanceof RuntimeBuildError) {
          process.stderr.write(`cad: ${formatBuildFailure(error)}\n`);
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    });

  // Default action (bare `cad` invocation) prints human-readable version info.
  program.action(() => {
    printVersion({});
  });

  return program;
}

/**
 * Commander error codes that represent a successful graceful exit rather
 * than an actual failure — `--version`, `--help`, and subcommand help all
 * surface through `exitOverride()` as errors, but we do not want to treat
 * them as such.
 */
const COMMANDER_SUCCESS_CODES = new Set([
  'commander.version',
  'commander.help',
  'commander.helpDisplayed',
]);

interface CommanderErrorLike {
  readonly code: string;
}

function isCommanderSuccess(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as CommanderErrorLike).code;
  return typeof code === 'string' && COMMANDER_SUCCESS_CODES.has(code);
}

/**
 * Entry point for the `cad` binary. Called by `bin/cad.js` — keep this as
 * the ONLY side-effecting import from this file so `createProgram` stays
 * pure for tests.
 *
 * Uses commander's `exitOverride()` so real parse failures throw instead
 * of calling `process.exit()` inside commander. That lets `runMain` be the
 * single arbiter of the process's exit code: graceful commander exits
 * (version/help) return normally, real errors print to stderr and set
 * `process.exitCode = 1`.
 */
export async function runMain(argv: readonly string[] = process.argv): Promise<void> {
  const program = createProgram();
  program.exitOverride();
  try {
    await program.parseAsync([...argv]);
  } catch (error: unknown) {
    if (isCommanderSuccess(error)) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`cad: ${message}\n`);
    process.exitCode = 1;
  }
}

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

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getPage, listTopics, search as searchHandbook } from '@cad/handbook';
import { executeDocument, exportBuildResultAsStl, RuntimeBuildError } from '@cad/runtime';
import { Command } from 'commander';
import { Marked, type MarkedExtension } from 'marked';

import { formatHuman, formatJson, getVersionInfo } from './commands/version.js';
import { CLI_VERSION } from './version.js';

interface VersionCommandOptions {
  readonly json?: boolean;
}

interface BuildCommandOptions {
  readonly timeoutMs?: string;
  readonly memoryMb?: string;
}

interface ExportCommandOptions extends BuildCommandOptions {
  readonly format?: string;
  readonly output?: string;
}

const markdownRenderer = new Marked(
  loadMarkedTerminal()({
    width: 100,
    reflowText: true,
  }),
);

function loadMarkedTerminal(): (options: {
  readonly width?: number;
  readonly reflowText?: boolean;
}) => MarkedExtension {
  const require = createRequire(import.meta.url);
  return require('marked-terminal').markedTerminal as (options: {
    readonly width?: number;
    readonly reflowText?: boolean;
  }) => MarkedExtension;
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

  program
    .command('export')
    .description('Build a document.ts file and write a temporary STL export')
    .argument('<path>', 'Path to the document.ts source file')
    .option('--format <format>', 'Export format', 'stl')
    .option('--output <path>', 'Output path for the exported file')
    .option('--timeout-ms <number>', 'Runtime timeout in milliseconds', '5000')
    .option('--memory-mb <number>', 'Worker memory cap in megabytes', '128')
    .action(async (sourcePath: string, options: ExportCommandOptions) => {
      if ((options.format ?? 'stl') !== 'stl') {
        process.stderr.write(`cad: unsupported export format: ${options.format ?? 'unknown'}\n`);
        process.exitCode = 1;
        return;
      }
      try {
        const source = await readFile(sourcePath, 'utf8');
        const result = await executeDocument(source, {
          timeoutMs: Number(options.timeoutMs ?? '5000'),
          memoryMb: Number(options.memoryMb ?? '128'),
        });
        const stl = exportBuildResultAsStl(result);
        const outputPath =
          options.output ??
          path.join(
            path.dirname(sourcePath),
            `${path.basename(sourcePath, path.extname(sourcePath))}.stl`,
          );
        await writeFile(outputPath, stl);
        process.stdout.write(`${outputPath}\n`);
      } catch (error) {
        if (error instanceof RuntimeBuildError) {
          process.stderr.write(`cad: ${formatBuildFailure(error)}\n`);
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    });

  const docsCommand = program
    .command('docs')
    .description('Read handbook entries from the terminal');

  docsCommand
    .argument(
      '[args...]',
      'Use `list`, `search <query>`, or a handbook path such as /handbook/features/pad',
    )
    .action(async (args: readonly string[]) => {
      if (args.length === 0 || (args.length === 1 && args[0] === 'list')) {
        const pages = await listTopics({ locale: 'en' });
        process.stdout.write(`${pages.map((page) => `${page.path} — ${page.title}`).join('\n')}\n`);
        return;
      }

      if (args[0] === 'search') {
        const query = args.slice(1).join(' ').trim();
        if (query.length === 0) {
          process.stderr.write('cad: docs search requires a query\n');
          process.exitCode = 1;
          return;
        }
        const pages = await searchHandbook(query, { locale: 'en' });
        process.stdout.write(
          `${pages.map((page) => `${page.path} — ${page.summary}`).join('\n')}\n`,
        );
        return;
      }

      if (args.length !== 1) {
        process.stderr.write(
          'cad: docs expects `list`, `search <query>`, or a single handbook path\n',
        );
        process.exitCode = 1;
        return;
      }

      const topic = args[0];
      if (topic === undefined) {
        process.stderr.write('cad: docs expects a handbook path\n');
        process.exitCode = 1;
        return;
      }
      const page = await getPage(topic, { locale: 'en' });
      if (page === null) {
        process.stderr.write(`cad: handbook topic not found: ${topic}\n`);
        process.exitCode = 1;
        return;
      }
      const rendered = await markdownRenderer.parse(`# ${page.title}\n\n${page.body}`);
      process.stdout.write(`${rendered}\n`);
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

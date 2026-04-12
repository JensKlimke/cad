/**
 * Unit tests for the commander program builder in `src/index.ts`.
 *
 * These exercise `createProgram()` directly so the command tree is
 * instrumented by v8 coverage — the integration test in `cli.int.test.ts`
 * spawns the built binary, which runs in a separate process and therefore
 * doesn't contribute to vitest coverage.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createProgram, runMain } from '../src/index.js';

describe('createProgram', () => {
  it('builds a commander program named "cad"', () => {
    const program = createProgram();
    expect(program.name()).toBe('cad');
    expect(program.description()).toContain('CAD');
  });

  it('exposes a -V/--version flag that prints a semver and exits', () => {
    const program = createProgram();
    const versionOption = program.options.find((opt) => opt.long === '--version');
    expect(versionOption).toBeDefined();
    expect(versionOption?.short).toBe('-V');
  });

  it('registers a `version` subcommand with a --json option', () => {
    const program = createProgram();
    const versionCommand = program.commands.find((cmd) => cmd.name() === 'version');
    expect(versionCommand).toBeDefined();
    const jsonOption = versionCommand?.options.find((opt) => opt.long === '--json');
    expect(jsonOption).toBeDefined();
  });

  it('prints a human-readable table when parsed with no arguments', async () => {
    const program = createProgram();
    const writes: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      });
    try {
      await program.parseAsync([], { from: 'user' });
    } finally {
      write.mockRestore();
    }
    const output = writes.join('');
    expect(output).toContain('cad           ');
    expect(output).toContain('@cad/kernel   ');
    expect(output).toContain('occt          ');
    expect(output).toContain('node          ');
  });

  it('prints JSON when `version --json` is parsed', async () => {
    const program = createProgram();
    const writes: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      });
    try {
      await program.parseAsync(['version', '--json'], { from: 'user' });
    } finally {
      write.mockRestore();
    }
    const output = writes.join('').trim();
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['cad']).toMatch(/^\d+\.\d+\.\d+/u);
    expect(parsed['kernel']).toMatch(/^\d+\.\d+\.\d+/u);
  });
});

describe('runMain', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('prints the version table when invoked with an empty argv', async () => {
    const writes: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      });
    try {
      await runMain(['node', '/path/to/cad']);
    } finally {
      write.mockRestore();
    }
    expect(writes.join('')).toContain('@cad/kernel   ');
    expect(process.exitCode).not.toBe(1);
  });

  it('writes the error message to stderr and sets exitCode on unknown commands', async () => {
    const stderrWrites: string[] = [];
    const errWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        stderrWrites.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      });
    try {
      // `runMain` uses `exitOverride` so commander throws instead of calling
      // `process.exit`; the catch block inside `runMain` converts the error
      // into an exitCode and a stderr message.
      await runMain(['node', '/path/to/cad', 'not-a-real-command']);
    } finally {
      errWrite.mockRestore();
    }
    expect(process.exitCode).toBe(1);
    const stderr = stderrWrites.join('');
    expect(stderr).toContain('cad:');
  });

  it('does not set exitCode on graceful --version output', async () => {
    const writes: string[] = [];
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
        return true;
      });
    try {
      await runMain(['node', '/path/to/cad', '--version']);
    } finally {
      write.mockRestore();
    }
    expect(process.exitCode).not.toBe(1);
    expect(writes.join('').trim()).toMatch(/^\d+\.\d+\.\d+/u);
  });
});

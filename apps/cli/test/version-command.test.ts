/**
 * Unit tests for the pure formatters in `src/commands/version.ts`.
 *
 * These drive the entire formatter surface without spawning the CLI.
 * End-to-end behaviour (commander parsing, stdout, exit codes) is
 * covered by `cli.int.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { formatHuman, formatJson, getVersionInfo } from '../src/commands/version.js';

describe('getVersionInfo', () => {
  it('returns a snapshot of every stack layer', () => {
    const info = getVersionInfo();
    expect(info.cad).toMatch(/^\d+\.\d+\.\d+/u);
    expect(info.kernel).toMatch(/^\d+\.\d+\.\d+/u);
    expect(info.occt).toMatch(/^replicad-opencascadejs@\d+\.\d+\.\d+/u);
    expect(info.node).toBe(process.version);
  });
});

describe('formatHuman', () => {
  it('renders a fixed-width aligned table', () => {
    const rendered = formatHuman({
      cad: '1.2.3',
      kernel: '4.5.6',
      occt: 'replicad-opencascadejs@0.23.0',
      node: 'v22.11.0',
    });
    const lines = rendered.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('cad           1.2.3');
    expect(lines[1]).toBe('@cad/kernel   4.5.6');
    expect(lines[2]).toBe('occt          replicad-opencascadejs@0.23.0');
    expect(lines[3]).toBe('node          v22.11.0');
  });
});

describe('formatJson', () => {
  it('renders pretty JSON that parses back to the original object', () => {
    const original = {
      cad: '1.2.3',
      kernel: '4.5.6',
      occt: 'replicad-opencascadejs@0.23.0',
      node: 'v22.11.0',
    };
    const rendered = formatJson(original);
    expect(JSON.parse(rendered)).toEqual(original);
  });

  it('uses two-space indentation', () => {
    const rendered = formatJson({
      cad: '0.0.1',
      kernel: '0.0.1',
      occt: 'replicad-opencascadejs@0.23.0',
      node: 'v22.11.0',
    });
    expect(rendered).toContain('\n  "cad"');
  });
});

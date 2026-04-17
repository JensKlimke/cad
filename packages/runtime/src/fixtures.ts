import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'slice-2',
);

export async function readSlice2Fixture(name: string): Promise<string> {
  return readFile(path.join(FIXTURE_ROOT, name), 'utf8');
}

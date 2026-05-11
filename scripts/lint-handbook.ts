import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';

import { HandbookFrontmatterSchema } from '../packages/handbook/src/index.js';
import { docMetadata } from '../packages/sdk/src/ops.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const CONTENT_ROOT = path.join(REPO_ROOT, 'packages', 'handbook', 'content');

async function main(): Promise<void> {
  const failures: string[] = [];
  await validateLocaleContent('en', failures);
  await validateLocaleContent('de', failures);

  for (const entry of Object.values(docMetadata)) {
    const englishPagePath =
      path.join(
        REPO_ROOT,
        'packages',
        'handbook',
        'content',
        'en',
        entry.handbookPath.replace('/handbook/', ''),
      ) + '.mdx';

    try {
      const raw = await readFile(englishPagePath, 'utf8');
      const frontmatter = HandbookFrontmatterSchema.parse(matter(raw).data);
      if (frontmatter.sdkOpId !== entry.id) {
        failures.push(`${entry.id}: expected sdkOpId "${entry.id}" in ${englishPagePath}`);
      }
    } catch (error) {
      failures.push(
        `${entry.id}: missing or invalid English handbook page at ${englishPagePath} (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  if (failures.length > 0) {
    process.stderr.write(
      `lint-handbook: FAIL\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `lint-handbook: OK — ${Object.keys(docMetadata).length} SDK op(s) and handbook pages validated.\n`,
  );
}

async function validateLocaleContent(locale: 'en' | 'de', failures: string[]): Promise<void> {
  const localeRoot = path.join(CONTENT_ROOT, locale);
  for (const kind of await safeReadDir(localeRoot)) {
    const kindRoot = path.join(localeRoot, kind);
    const stats = await safeReadDir(kindRoot);
    for (const entry of stats.filter((name) => name.endsWith('.mdx'))) {
      const filePath = path.join(kindRoot, entry);
      try {
        HandbookFrontmatterSchema.parse(matter(await readFile(filePath, 'utf8')).data);
      } catch (error) {
        failures.push(
          `${locale}/${kind}/${entry}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}

async function safeReadDir(directoryPath: string): Promise<readonly string[]> {
  try {
    return await readdir(directoryPath);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

await main();

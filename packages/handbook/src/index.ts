import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORTED_LOCALES, type Locale } from '@cad/i18n';
import GithubSlugger from 'github-slugger';
import matter from 'gray-matter';
import { toString } from 'mdast-util-to-string';
import MiniSearch from 'minisearch';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

const CONTENT_KINDS = ['concepts', 'workflows', 'faq', 'features'] as const;

export type HandbookKind = (typeof CONTENT_KINDS)[number];

export const HandbookKindSchema = z.enum(CONTENT_KINDS);

export const HandbookFrontmatterSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  sdkOpId: z.string().min(1).optional(),
});

export interface HandbookHeading {
  readonly depth: number;
  readonly slug: string;
  readonly title: string;
}

export interface HandbookPageSummary {
  readonly kind: HandbookKind;
  readonly slug: string;
  readonly path: `/handbook/${HandbookKind}/${string}`;
  readonly title: string;
  readonly summary: string;
  readonly tags: string[];
  readonly sdkOpId?: string;
  readonly requestedLocale: Locale;
  readonly sourceLocale: Locale;
  readonly isFallback: boolean;
}

export interface HandbookPage extends HandbookPageSummary {
  readonly body: string;
  readonly html: string;
  readonly headings: HandbookHeading[];
}

interface CatalogPage {
  readonly locale: Locale;
  readonly kind: HandbookKind;
  readonly slug: string;
  readonly path: `/handbook/${HandbookKind}/${string}`;
  readonly title: string;
  readonly summary: string;
  readonly tags: string[];
  readonly sdkOpId?: string;
  readonly body: string;
  readonly html: string;
  readonly headings: HandbookHeading[];
  readonly text: string;
}

interface SearchDocument {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly tags: string;
}

interface Catalog {
  readonly pagesByLocale: Readonly<Record<Locale, ReadonlyMap<string, CatalogPage>>>;
  readonly searchByLocale: Readonly<Record<Locale, MiniSearch<SearchDocument>>>;
}

const HANDOOK_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'content',
);

let catalogPromise: Promise<Catalog> | null = null;

export async function listTopics(options: {
  readonly locale?: Locale;
  readonly kind?: HandbookKind;
} = {}): Promise<HandbookPageSummary[]> {
  const requestedLocale = options.locale ?? 'en';
  const catalog = await loadCatalog();
  const seen = new Set<string>();
  const items: HandbookPageSummary[] = [];
  for (const locale of localesForLookup(requestedLocale)) {
    for (const page of catalog.pagesByLocale[locale].values()) {
      if (options.kind !== undefined && page.kind !== options.kind) {
        continue;
      }
      if (seen.has(page.path)) {
        continue;
      }
      seen.add(page.path);
      items.push(toSummary(page, requestedLocale));
    }
  }
  return items.toSorted((left, right) => left.title.localeCompare(right.title));
}

export async function getPage(
  handbookPath: string,
  options: { readonly locale?: Locale } = {},
): Promise<HandbookPage | null> {
  const requestedLocale = options.locale ?? 'en';
  const normalized = normalizeHandbookPath(handbookPath);
  const catalog = await loadCatalog();
  for (const locale of localesForLookup(requestedLocale)) {
    const page = catalog.pagesByLocale[locale].get(normalized);
    if (page !== undefined) {
      return {
        ...toSummary(page, requestedLocale),
        body: page.body,
        html: page.html,
        headings: page.headings,
      };
    }
  }
  return null;
}

export async function search(
  query: string,
  options: {
    readonly locale?: Locale;
    readonly kind?: HandbookKind;
    readonly limit?: number;
  } = {},
): Promise<HandbookPageSummary[]> {
  const requestedLocale = options.locale ?? 'en';
  const catalog = await loadCatalog();
  const combined = new Map<string, HandbookPageSummary>();
  for (const locale of localesForLookup(requestedLocale)) {
    const results = catalog.searchByLocale[locale].search(query, {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    });
    for (const result of results) {
      const page = catalog.pagesByLocale[locale].get(result.id);
      if (page === undefined) {
        continue;
      }
      if (options.kind !== undefined && page.kind !== options.kind) {
        continue;
      }
      if (!combined.has(page.path)) {
        combined.set(page.path, toSummary(page, requestedLocale));
      }
    }
  }
  const limit = options.limit ?? 10;
  return [...combined.values()]
    .toSorted((left, right) => left.title.localeCompare(right.title))
    .slice(0, limit);
}

export async function forSdkOp(
  opId: string,
  options: { readonly locale?: Locale } = {},
): Promise<HandbookPage | null> {
  const requestedLocale = options.locale ?? 'en';
  const catalog = await loadCatalog();
  for (const locale of localesForLookup(requestedLocale)) {
    for (const page of catalog.pagesByLocale[locale].values()) {
      if (page.sdkOpId === opId) {
        return {
          ...toSummary(page, requestedLocale),
          body: page.body,
          html: page.html,
          headings: page.headings,
        };
      }
    }
  }
  return null;
}

async function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= buildCatalog();
  return catalogPromise;
}

async function buildCatalog(): Promise<Catalog> {
  const pageEntries = await Promise.all(
    SUPPORTED_LOCALES.map(async (locale) => [locale, await loadPagesForLocale(locale)] as const),
  );
  const pagesByLocale = Object.fromEntries(pageEntries) as Readonly<Record<Locale, ReadonlyMap<string, CatalogPage>>>;
  const searchByLocale = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [locale, buildSearchIndex(pagesByLocale[locale])]),
  ) as Readonly<Record<Locale, MiniSearch<SearchDocument>>>;
  return {
    pagesByLocale,
    searchByLocale,
  };
}

async function loadPagesForLocale(locale: Locale): Promise<ReadonlyMap<string, CatalogPage>> {
  const localeRoot = path.join(HANDOOK_ROOT, locale);
  const pages = new Map<string, CatalogPage>();
  for (const kind of CONTENT_KINDS) {
    const kindRoot = path.join(localeRoot, kind);
    const files = await readDirSafe(kindRoot);
    for (const fileName of files.filter((file) => file.endsWith('.mdx'))) {
      const slug = fileName.replace(/\.mdx$/u, '');
      const filePath = path.join(kindRoot, fileName);
      const source = await readFile(filePath, 'utf8');
      const parsed = matter(source);
      const frontmatter = HandbookFrontmatterSchema.parse(parsed.data);
      const body = parsed.content.trim();
      const headings = extractHeadings(body);
      const html = await compileHtml(body);
      const pagePath = `/handbook/${kind}/${slug}` as const;
      pages.set(pagePath, {
        locale,
        kind,
        slug,
        path: pagePath,
        title: frontmatter.title,
        summary: frontmatter.summary,
        tags: [...frontmatter.tags],
        ...(frontmatter.sdkOpId === undefined ? {} : { sdkOpId: frontmatter.sdkOpId }),
        body,
        html: decorateCodeBlocks(html),
        headings,
        text: extractPlainText(body),
      });
    }
  }
  return pages;
}

async function readDirSafe(directoryPath: string): Promise<readonly string[]> {
  try {
    return await readdir(directoryPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function buildSearchIndex(pages: ReadonlyMap<string, CatalogPage>): MiniSearch<SearchDocument> {
  const search = new MiniSearch<SearchDocument>({
    fields: ['title', 'summary', 'body', 'tags'],
    storeFields: ['id', 'path', 'title', 'summary', 'body', 'tags'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });
  search.addAll(
    [...pages.values()].map((page) => ({
      id: page.path,
      path: page.path,
      title: page.title,
      summary: page.summary,
      body: page.text,
      tags: page.tags.join(' '),
    })),
  );
  return search;
}

function toSummary(page: CatalogPage, requestedLocale: Locale): HandbookPageSummary {
  return {
    kind: page.kind,
    slug: page.slug,
    path: page.path,
    title: page.title,
    summary: page.summary,
    tags: [...page.tags],
    ...(page.sdkOpId === undefined ? {} : { sdkOpId: page.sdkOpId }),
    requestedLocale,
    sourceLocale: page.locale,
    isFallback: page.locale !== requestedLocale,
  };
}

function localesForLookup(locale: Locale): readonly Locale[] {
  return locale === 'en' ? ['en'] : [locale, 'en'];
}

function normalizeHandbookPath(handbookPath: string): `/handbook/${HandbookKind}/${string}` {
  const parts = handbookPath.split('/').filter(Boolean);
  if (parts.length !== 3 || parts[0] !== 'handbook') {
    throw new Error(`Invalid handbook path: ${handbookPath}`);
  }
  const kind = HandbookKindSchema.parse(parts[1]);
  const slug = parts[2];
  return `/handbook/${kind}/${slug}`;
}

function extractHeadings(source: string): HandbookHeading[] {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  const slugger = new GithubSlugger();
  const headings: HandbookHeading[] = [];
  visit(tree, 'heading', (node) => {
    const title = toString(node).trim();
    if (title.length === 0) {
      return;
    }
    headings.push({
      depth: node.depth,
      slug: slugger.slug(title),
      title,
    });
  });
  return headings;
}

function extractPlainText(source: string): string {
  const tree = unified().use(remarkParse).use(remarkMdx).parse(source);
  return toString(tree);
}

async function compileHtml(source: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeStringify)
    .process(source);
  return String(file.value);
}

function decorateCodeBlocks(html: string): string {
  return html.replaceAll(
    '<pre><code',
    '<div class="handbook-code-block"><div class="handbook-code-toolbar"><button type="button" class="handbook-copy-button" data-copy-code>Copy</button></div><pre><code',
  ).replaceAll('</pre>', '</pre></div>');
}

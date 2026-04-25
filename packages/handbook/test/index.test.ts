import { describe, expect, it } from 'vitest';

import { forSdkOp, getPage, listTopics, search } from '../src/index.js';

describe('@cad/handbook', () => {
  it('loads a localized page and falls back to English when missing', async () => {
    const translated = await getPage('/handbook/faq/getting-help', { locale: 'de' });
    expect(translated).not.toBeNull();
    expect(translated?.sourceLocale).toBe('de');
    expect(translated?.isFallback).toBe(false);

    const fallback = await getPage('/handbook/features/pad', { locale: 'de' });
    expect(fallback).not.toBeNull();
    expect(fallback?.sourceLocale).toBe('en');
    expect(fallback?.isFallback).toBe(true);
  });

  it('searches across localized and fallback content', async () => {
    const results = await search('pad', { locale: 'de' });
    expect(results.some((result) => result.path === '/handbook/features/pad')).toBe(true);
  });

  it('looks up pages by SDK op id', async () => {
    const page = await forSdkOp('pad', { locale: 'en' });
    expect(page?.path).toBe('/handbook/features/pad');
    expect(page?.headings.length).toBeGreaterThan(0);
  });

  it('lists topics for a specific kind', async () => {
    const pages = await listTopics({ locale: 'en', kind: 'concepts' });
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((page) => page.kind === 'concepts')).toBe(true);
  });
});

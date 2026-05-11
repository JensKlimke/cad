import { useT } from '@cad/i18n';
import {
  HandbookListResponseSchema,
  HandbookPageSchema,
  HandbookSearchResponseSchema,
  type HandbookKind,
  type HandbookPage,
  type HandbookPageSummary,
} from '@cad/protocol';
import { useQuery } from '@tanstack/react-query';

import { apiFetch } from './client.js';

export function useHandbookPage(kind: HandbookKind | undefined, slug: string | undefined) {
  const { i18n } = useT('handbook');
  return useQuery({
    queryKey: ['handbook', 'page', kind, slug, i18n.language],
    enabled: kind !== undefined && slug !== undefined,
    queryFn: async (): Promise<HandbookPage> =>
      apiFetch(`/handbook/pages/${kind ?? ''}/${slug ?? ''}`, {
        schema: HandbookPageSchema,
        query: { locale: i18n.language },
      }),
  });
}

export async function fetchHandbookPageByOp(opId: string, locale: string): Promise<HandbookPage> {
  return apiFetch(`/handbook/sdk/${opId}`, {
    schema: HandbookPageSchema,
    query: { locale },
  });
}

export async function searchHandbook(
  query: string,
  locale: string,
): Promise<readonly HandbookPageSummary[]> {
  const response = await apiFetch('/handbook/search', {
    schema: HandbookSearchResponseSchema,
    query: { q: query, locale },
  });
  return response.items;
}

export async function listHandbook(
  kind: HandbookKind | undefined,
  locale: string,
): Promise<readonly HandbookPageSummary[]> {
  const response = await apiFetch('/handbook/list', {
    schema: HandbookListResponseSchema,
    query: {
      locale,
      ...(kind === undefined ? {} : { kind }),
    },
  });
  return response.items;
}

import { useQuery } from '@tanstack/react-query';

import { useLanguage } from '@/hooks/useLanguage';

/** A search result from the Wikipedia search API. */
export interface WikipediaSearchResult {
  /** Article title */
  title: string;
  /** Short description / extract */
  description: string;
  /** Full URL to the Wikipedia article */
  url: string;
  /** Thumbnail URL (if available) */
  thumbnail?: string;
}

interface PageResult {
  pageid: number;
  title: string;
  index: number;
  description?: string;
  thumbnail?: { source: string; width: number; height: number };
}

async function searchWikipedia(
  query: string,
  lang: string,
  signal?: AbortSignal,
): Promise<WikipediaSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '10',
    prop: 'pageimages|description',
    piprop: 'thumbnail',
    pithumbsize: '80',
    pilicense: 'any',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(
    `https://${lang}.wikipedia.org/w/api.php?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );

  if (!res.ok) return [];

  const data = await res.json();
  const pages: Record<string, PageResult> = data?.query?.pages ?? {};

  return Object.values(pages)
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      title: p.title,
      description: p.description ?? '',
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      thumbnail: p.thumbnail?.source,
    }));
}

/** Hook to search Wikipedia articles by title/content in the user's language. */
export function useWikipediaSearch(query: string) {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['wikipedia-search', locale, query],
    queryFn: ({ signal }) => searchWikipedia(query, locale, signal),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

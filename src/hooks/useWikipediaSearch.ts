import { useQuery } from '@tanstack/react-query';

/** A search result from the Wikipedia opensearch API. */
export interface WikipediaSearchResult {
  /** Article title */
  title: string;
  /** Short description / extract */
  description: string;
  /** Full URL to the Wikipedia article */
  url: string;
}

async function searchWikipedia(
  query: string,
  signal?: AbortSignal,
): Promise<WikipediaSearchResult[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '0',
    srlimit: '10',
    srprop: 'snippet',
    format: 'json',
    origin: '*',
  });

  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?${params}`,
    { signal, headers: { Accept: 'application/json' } },
  );

  if (!res.ok) return [];

  const data = await res.json();
  const results: Array<{ title: string; snippet: string; pageid: number }> =
    data?.query?.search ?? [];

  return results.map((r) => ({
    title: r.title,
    description: r.snippet.replace(/<\/?[^>]+(>|$)/g, ''), // strip HTML tags
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
  }));
}

/** Hook to search Wikipedia articles by title/content. */
export function useWikipediaSearch(query: string) {
  return useQuery({
    queryKey: ['wikipedia-search', query],
    queryFn: ({ signal }) => searchWikipedia(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

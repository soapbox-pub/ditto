import { useQuery } from '@tanstack/react-query';

/** A search result from the Internet Archive advanced search API. */
export interface ArchiveSearchResult {
  /** archive.org item identifier (used in URLs and thumbnails) */
  identifier: string;
  /** Display title */
  title: string;
  /** Media type: "software", "movies", "audio", "etree", "texts", etc. */
  mediatype: string;
  /** Total download count (used for sorting relevance) */
  downloads: number;
}

interface SearchDoc {
  identifier: string;
  title: string;
  mediatype: string;
  downloads: number;
}

interface SearchResponse {
  response: {
    numFound: number;
    docs: SearchDoc[];
  };
}

const ALLOWED_MEDIA_TYPES = ['software', 'movies', 'audio', 'etree', 'texts'];

async function searchArchive(query: string, signal?: AbortSignal): Promise<ArchiveSearchResult[]> {
  // Use title search with media type filter for relevant results.
  const q = `title:(${query}) mediatype:(${ALLOWED_MEDIA_TYPES.join(' OR ')})`;

  // fl[] needs to be repeated for each field — URLSearchParams can't handle
  // repeated keys cleanly, so we build the URL manually.
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}`
    + '&fl[]=identifier&fl[]=title&fl[]=mediatype&fl[]=downloads'
    + '&sort[]=-downloads&rows=12&output=json';

  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];

  const data: SearchResponse = await response.json();

  return data.response.docs.map((doc) => ({
    identifier: doc.identifier,
    title: doc.title,
    mediatype: doc.mediatype,
    downloads: doc.downloads,
  }));
}

/** Hook to search the Internet Archive by title. */
export function useArchiveSearch(query: string) {
  return useQuery({
    queryKey: ['archive-search', query],
    queryFn: ({ signal }) => searchArchive(query, signal),
    enabled: query.trim().length >= 2,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

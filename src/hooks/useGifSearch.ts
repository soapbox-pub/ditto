import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

const GIFVERSE_BASE_URL = 'https://gifverse.net/api/v1';
const GIFVERSE_MEDIA_URL = 'https://gifverse.net/media';
const RESULTS_LIMIT = 30;

interface GifverseResult {
  /** GIF id */
  i: string;
  /** Title */
  ti: string;
  /** Description */
  de?: string;
  /** Width */
  w: number;
  /** Height */
  h: number;
  /** Available video formats (e.g. av1, webm, mp4) */
  f: string[];
  /** NSFW flag */
  nsfw: boolean;
}

interface GifverseResponse {
  results: GifverseResult[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}

export interface GifResult {
  id: string;
  title: string;
  /** URL for the full-size GIF */
  url: string;
  /** URL for a smaller preview thumbnail */
  previewUrl: string;
  /** Width of the preview */
  width: number;
  /** Height of the preview */
  height: number;
}

function mapGifverseResult(result: GifverseResult): GifResult {
  const url = `${GIFVERSE_MEDIA_URL}/${result.i}/original.gif`;

  return {
    id: result.i,
    title: result.ti || result.de || '',
    url,
    previewUrl: url,
    width: result.w || 220,
    height: result.h || 160,
  };
}

function mapResults(data: GifverseResponse): GifResult[] {
  return data.results.filter((r) => !r.nsfw).map(mapGifverseResult);
}

async function fetchGifverseSearch(query: string): Promise<{ results: GifResult[] }> {
  const params = new URLSearchParams({
    q: query,
    limit: String(RESULTS_LIMIT),
    offset: '0',
    sort: 'relevant',
  });

  const res = await fetch(`${GIFVERSE_BASE_URL}/search?${params}`);
  if (!res.ok) throw new Error(`GIFverse search failed: ${res.status}`);

  const data: GifverseResponse = await res.json();
  return { results: mapResults(data) };
}

async function fetchGifverseTrending(): Promise<{ results: GifResult[] }> {
  const params = new URLSearchParams({
    limit: String(RESULTS_LIMIT),
    offset: '0',
    sort: 'popular',
  });

  const res = await fetch(`${GIFVERSE_BASE_URL}/trending?${params}`);
  if (!res.ok) throw new Error(`GIFverse trending failed: ${res.status}`);

  const data: GifverseResponse = await res.json();
  return { results: mapResults(data) };
}

export function useGifSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value.trim());
    }, 300);
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
    clearTimeout(debounceRef.current);
  }, []);

  const isSearching = debouncedQuery.length > 0;

  const trendingQuery = useQuery({
    queryKey: ['gifverse', 'trending'],
    queryFn: () => fetchGifverseTrending(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: ['gifverse', 'search', debouncedQuery],
    queryFn: () => fetchGifverseSearch(debouncedQuery),
    staleTime: 2 * 60 * 1000, // 2 minutes
    enabled: isSearching,
  });

  const activeQuery = isSearching ? searchQuery : trendingQuery;

  return {
    query,
    setQuery: handleQueryChange,
    clearQuery,
    results: activeQuery.data?.results ?? [],
    isLoading: activeQuery.isLoading,
    isError: activeQuery.isError,
    isSearching,
  };
}

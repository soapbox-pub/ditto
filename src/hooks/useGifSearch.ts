import { useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Tenor public API key
const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2';
const RESULTS_LIMIT = 30;

interface TenorMediaFormat {
  url: string;
  dims: [number, number];
  duration: number;
  size: number;
}

interface TenorResult {
  id: string;
  title: string;
  media_formats: {
    gif?: TenorMediaFormat;
    tinygif?: TenorMediaFormat;
    nanogif?: TenorMediaFormat;
    mediumgif?: TenorMediaFormat;
    gifpreview?: TenorMediaFormat;
    tinygifpreview?: TenorMediaFormat;
  };
  content_description: string;
  created: number;
  url: string;
}

interface TenorResponse {
  results: TenorResult[];
  next: string;
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

function mapTenorResult(result: TenorResult): GifResult {
  const gif = result.media_formats.gif ?? result.media_formats.mediumgif;
  const preview = result.media_formats.tinygif ?? result.media_formats.nanogif;

  return {
    id: result.id,
    title: result.content_description || result.title,
    url: gif?.url ?? preview?.url ?? '',
    previewUrl: preview?.url ?? gif?.url ?? '',
    width: preview?.dims[0] ?? gif?.dims[0] ?? 220,
    height: preview?.dims[1] ?? gif?.dims[1] ?? 160,
  };
}

async function fetchTenorSearch(query: string, pos?: string): Promise<{ results: GifResult[]; next: string }> {
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    q: query,
    limit: String(RESULTS_LIMIT),
    media_filter: 'gif,tinygif',
    contentfilter: 'medium',
    client_key: 'ditto_nostr',
  });
  if (pos) params.set('pos', pos);

  const res = await fetch(`${TENOR_BASE_URL}/search?${params}`);
  if (!res.ok) throw new Error(`Tenor search failed: ${res.status}`);

  const data: TenorResponse = await res.json();
  return {
    results: data.results.map(mapTenorResult).filter((g) => g.url),
    next: data.next,
  };
}

async function fetchTenorTrending(pos?: string): Promise<{ results: GifResult[]; next: string }> {
  const params = new URLSearchParams({
    key: TENOR_API_KEY,
    limit: String(RESULTS_LIMIT),
    media_filter: 'gif,tinygif',
    contentfilter: 'medium',
    client_key: 'ditto_nostr',
  });
  if (pos) params.set('pos', pos);

  const res = await fetch(`${TENOR_BASE_URL}/featured?${params}`);
  if (!res.ok) throw new Error(`Tenor featured failed: ${res.status}`);

  const data: TenorResponse = await res.json();
  return {
    results: data.results.map(mapTenorResult).filter((g) => g.url),
    next: data.next,
  };
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
    queryKey: ['tenor', 'trending'],
    queryFn: () => fetchTenorTrending(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !isSearching,
  });

  const searchQuery = useQuery({
    queryKey: ['tenor', 'search', debouncedQuery],
    queryFn: () => fetchTenorSearch(debouncedQuery),
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

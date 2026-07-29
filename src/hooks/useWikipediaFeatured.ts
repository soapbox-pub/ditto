import { useQuery } from '@tanstack/react-query';

import { useLanguage } from '@/hooks/useLanguage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WikiPage {
  type: string;
  title: string;
  normalizedtitle: string;
  displaytitle: string;
  pageid: number;
  description?: string;
  extract: string;
  extract_html: string;
  thumbnail?: { source: string; width: number; height: number };
  originalimage?: { source: string; width: number; height: number };
  content_urls: {
    desktop: { page: string };
    mobile: { page: string };
  };
  titles: { canonical: string; normalized: string; display: string };
  /** Only present on most-read articles. */
  views?: number;
  rank?: number;
}

export interface OnThisDayEvent {
  text: string;
  year: number;
  pages: WikiPage[];
}

export interface NewsItem {
  story: string;
  links: WikiPage[];
}

export interface DykItem {
  html: string;
  text: string;
}

export interface PictureOfTheDay {
  title: string;
  thumbnail: { source: string; width: number; height: number };
  image: { source: string; width: number; height: number };
  description: { html: string; text: string; lang: string };
  artist?: { html: string; text: string };
  license?: { type: string; code: string };
  file_page: string;
}

export interface WikipediaFeaturedFeed {
  tfa?: WikiPage;
  mostread?: { date: string; articles: WikiPage[] };
  onthisday?: OnThisDayEvent[];
  news?: NewsItem[];
  dyk?: DykItem[];
  image?: PictureOfTheDay;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

async function fetchFeaturedFeed(lang: string, signal?: AbortSignal): Promise<WikipediaFeaturedFeed> {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');

  const res = await fetch(
    `https://${lang}.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`,
    {
      signal,
      headers: { Accept: 'application/json' },
    },
  );

  if (!res.ok) {
    throw new Error(`Wikipedia featured feed failed: ${res.status}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Fetches Wikipedia's featured content feed for today.
 * Includes: Today's Featured Article, Most Read, On This Day,
 * In the News, Did You Know, and Picture of the Day.
 */
export function useWikipediaFeatured() {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['wikipedia-featured', locale, new Date().toISOString().slice(0, 10)],
    queryFn: ({ signal }) => fetchFeaturedFeed(locale, signal),
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 2, // 2 hours
    retry: 2,
  });
}

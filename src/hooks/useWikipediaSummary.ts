import { useQuery } from '@tanstack/react-query';

import { useLanguage } from '@/hooks/useLanguage';

export interface WikipediaSummary {
  /** Page title. */
  title: string;
  /** Short plain-text extract (first paragraph). */
  extract: string;
  /** Longer HTML extract. */
  extractHtml: string;
  /** Page description (Wikidata short description). */
  description?: string;
  /** Thumbnail image. */
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  /** Original full-resolution image. */
  originalImage?: {
    source: string;
    width: number;
    height: number;
  };
  /** Full URL to the Wikipedia article. */
  articleUrl: string;
}

async function fetchWikipediaSummary(
  title: string,
  lang: string,
  signal?: AbortSignal,
): Promise<WikipediaSummary | null> {
  try {
    const encoded = encodeURIComponent(title.replace(/ /g, '_'));
    const response = await fetch(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      {
        signal,
        headers: { Accept: 'application/json' },
      },
    );

    if (!response.ok) return null;

    const data = await response.json();

    // The API returns a "type" field — "standard" for normal articles,
    // "disambiguation" for disambiguation pages, "no-extract" when missing.
    if (data.type === 'disambiguation' || data.type === 'no-extract') {
      return null;
    }

    return {
      title: data.title ?? title,
      extract: data.extract ?? '',
      extractHtml: data.extract_html ?? '',
      description: data.description,
      thumbnail: data.thumbnail
        ? {
            source: data.thumbnail.source,
            width: data.thumbnail.width,
            height: data.thumbnail.height,
          }
        : undefined,
      originalImage: data.originalimage
        ? {
            source: data.originalimage.source,
            width: data.originalimage.width,
            height: data.originalimage.height,
          }
        : undefined,
      articleUrl: data.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encoded}`,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a Wikipedia page summary for a given article title.
 * Uses the Wikimedia REST API `/page/summary/{title}`, targeting the
 * user's selected interface language (e.g. `de.wikipedia.org`).
 */
export function useWikipediaSummary(title: string | null) {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['wikipedia-summary', locale, title],
    queryFn: ({ signal }) => fetchWikipediaSummary(title!, locale, signal),
    enabled: !!title,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}

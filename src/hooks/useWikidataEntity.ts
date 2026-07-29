import { useQuery } from '@tanstack/react-query';

import { useLanguage } from '@/hooks/useLanguage';

export interface WikidataEntity {
  /** The Wikidata entity ID (e.g. "Q42"). */
  id: string;
  /**
   * Wikipedia article title for this entity, if one exists. Prefers the
   * user's language sitelink (e.g. `dewiki`), falling back to `enwiki`.
   */
  wikipediaTitle: string | null;
  /**
   * Full URL to the Wikipedia article for this entity, if one exists. Prefers
   * the user's language sitelink (e.g. `dewiki`), falling back to `enwiki`.
   */
  wikipediaUrl: string | null;
}

async function fetchWikidataEntity(
  id: string,
  lang: string,
  signal?: AbortSignal,
): Promise<WikidataEntity | null> {
  try {
    // Use the Action API with CORS-friendly origin=* and minimal props.
    // Request the user's language sitelink plus English as a fallback.
    const sites = lang === 'en' ? ['enwiki'] : [`${lang}wiki`, 'enwiki'];

    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', id);
    url.searchParams.set('props', 'sitelinks/urls');
    url.searchParams.set('sitefilter', sites.join('|'));
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const response = await fetch(url.toString(), {
      signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const entity = data?.entities?.[id];
    if (!entity || entity.missing !== undefined) return null;

    // Prefer the localized sitelink; fall back to English.
    const sitelink = entity.sitelinks?.[`${lang}wiki`] ?? entity.sitelinks?.enwiki;
    const wikipediaTitle = typeof sitelink?.title === 'string' ? sitelink.title : null;
    const wikipediaUrl = typeof sitelink?.url === 'string' ? sitelink.url : null;

    return { id, wikipediaTitle, wikipediaUrl };
  } catch {
    return null;
  }
}

/**
 * Resolve a Wikidata entity ID (e.g. "Q42") to its Wikipedia article, if any.
 * Uses the Wikidata Action API `wbgetentities` endpoint, preferring the user's
 * language sitelink and falling back to `enwiki`.
 */
export function useWikidataEntity(id: string | null) {
  const { locale } = useLanguage();

  return useQuery({
    queryKey: ['wikidata-entity', locale, id],
    queryFn: ({ signal }) => fetchWikidataEntity(id!, locale, signal),
    enabled: !!id,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}

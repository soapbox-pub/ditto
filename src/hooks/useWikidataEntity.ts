import { useQuery } from '@tanstack/react-query';

export interface WikidataEntity {
  /** The Wikidata entity ID (e.g. "Q42"). */
  id: string;
  /**
   * English Wikipedia article title for this entity, if one exists.
   * Derived from the `enwiki` sitelink.
   */
  wikipediaTitle: string | null;
  /**
   * Full URL to the English Wikipedia article for this entity, if one exists.
   * Derived from the `enwiki` sitelink URL.
   */
  wikipediaUrl: string | null;
}

async function fetchWikidataEntity(
  id: string,
  signal?: AbortSignal,
): Promise<WikidataEntity | null> {
  try {
    // Use the Action API with CORS-friendly origin=* and minimal props.
    // We only need the English Wikipedia sitelink to resolve to a Wikipedia article.
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbgetentities');
    url.searchParams.set('ids', id);
    url.searchParams.set('props', 'sitelinks/urls');
    url.searchParams.set('sitefilter', 'enwiki');
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

    const enwiki = entity.sitelinks?.enwiki;
    const wikipediaTitle = typeof enwiki?.title === 'string' ? enwiki.title : null;
    const wikipediaUrl = typeof enwiki?.url === 'string' ? enwiki.url : null;

    return { id, wikipediaTitle, wikipediaUrl };
  } catch {
    return null;
  }
}

/**
 * Resolve a Wikidata entity ID (e.g. "Q42") to its English Wikipedia article, if any.
 * Uses the Wikidata Action API `wbgetentities` endpoint with `sitefilter=enwiki`.
 */
export function useWikidataEntity(id: string | null) {
  return useQuery({
    queryKey: ['wikidata-entity', id],
    queryFn: ({ signal }) => fetchWikidataEntity(id!, signal),
    enabled: !!id,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}

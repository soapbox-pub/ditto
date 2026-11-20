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

/** Most ids `wbgetentities` takes in one request. */
const BATCH_SIZE = 50;
/** How long lookups wait to be batched together, in ms. */
const BATCH_DELAY_MS = 10;

const WIKIDATA_ID = /^[QPL]\d+$/;

type Waiter = (entity: WikidataEntity | null) => void;

/** Ids waiting for the next batch, by language. */
const pending = new Map<string, Map<string, Waiter[]>>();
let batchTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * One `wbgetentities` request for up to {@link BATCH_SIZE} ids. Every id
 * resolves, to null when it's missing or the request fails.
 */
async function fetchWikidataEntities(
  ids: string[],
  lang: string,
): Promise<Map<string, WikidataEntity | null>> {
  const result = new Map<string, WikidataEntity | null>(ids.map((id) => [id, null]));
  // An id Wikidata doesn't know fails the whole request, naming it: ask
  // again without it.
  let remaining = ids;
  try {
    while (remaining.length > 0) {
      const data = await requestEntities(remaining, lang);
      if (!data) break;
      const unknown = data.error?.code === 'no-such-entity' ? data.error.id : undefined;
      if (unknown !== undefined) {
        if (!remaining.includes(unknown)) break;
        remaining = remaining.filter((id) => id !== unknown);
        continue;
      }
      for (const id of remaining) {
        const entity = data.entities?.[id];
        if (!entity || entity.missing !== undefined) continue;

        // Prefer the localized sitelink; fall back to English.
        const sitelink = entity.sitelinks?.[`${lang}wiki`] ?? entity.sitelinks?.enwiki;
        const wikipediaTitle = typeof sitelink?.title === 'string' ? sitelink.title : null;
        const wikipediaUrl = typeof sitelink?.url === 'string' ? sitelink.url : null;

        result.set(id, { id, wikipediaTitle, wikipediaUrl });
      }
      break;
    }
  } catch {
    // Whatever didn't resolve stays null.
  }
  return result;
}

interface WbGetEntitiesResponse {
  error?: { code?: string; id?: string };
  entities?: Record<string, {
    missing?: string;
    sitelinks?: Record<string, { title?: unknown; url?: unknown }>;
  }>;
}

async function requestEntities(ids: string[], lang: string): Promise<WbGetEntitiesResponse | null> {
  // Use the Action API with CORS-friendly origin=* and minimal props.
  // Request the user's language sitelink plus English as a fallback.
  const sites = lang === 'en' ? ['enwiki'] : [`${lang}wiki`, 'enwiki'];

  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', ids.join('|'));
  url.searchParams.set('props', 'sitelinks/urls');
  url.searchParams.set('sitefilter', sites.join('|'));
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  return response.ok ? response.json() : null;
}

function flushBatches(): void {
  batchTimer = undefined;
  const batches = [...pending];
  pending.clear();
  for (const [lang, waiters] of batches) {
    const ids = [...waiters.keys()];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      void fetchWikidataEntities(chunk, lang).then((entities) => {
        for (const id of chunk) {
          for (const resolve of waiters.get(id) ?? []) resolve(entities.get(id) ?? null);
        }
      });
    }
  }
}

/**
 * Look up one entity. Lookups made within a few milliseconds of each other
 * share requests: a Birdex renders a tile and a chorus voice per species, and
 * asked one at a time a life list cost a hundred requests to Wikidata.
 */
function fetchWikidataEntity(id: string, lang: string): Promise<WikidataEntity | null> {
  // An id the API can't parse would fail the whole batch.
  if (!WIKIDATA_ID.test(id)) return Promise.resolve(null);
  return new Promise((resolve) => {
    let waiters = pending.get(lang);
    if (!waiters) pending.set(lang, (waiters = new Map()));
    const list = waiters.get(id);
    if (list) list.push(resolve);
    else waiters.set(id, [resolve]);
    batchTimer ??= setTimeout(flushBatches, BATCH_DELAY_MS);
  });
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
    queryFn: () => fetchWikidataEntity(id!, locale),
    enabled: !!id,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
    retry: 1,
  });
}

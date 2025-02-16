import { DOMParser } from '@b-fuze/deno-dom';
import { DittoTables } from '@ditto/db';
import { cachedFaviconsSizeGauge } from '@ditto/metrics';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import { Kysely } from 'kysely';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { nostrNow } from '@/utils.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';

export const faviconCache = new SimpleLRU<string, URL>(
  async (domain, { signal }) => {
    const kysely = await Storages.kysely();

    const row = await queryFavicon(kysely, domain);

    if (row && (nostrNow() - row.last_updated_at) < (Conf.caches.favicon.ttl / 1000)) {
      return new URL(row.favicon);
    }

    const url = await fetchFavicon(domain, signal);

    await insertFavicon(kysely, domain, url.href);

    return url;
  },
  { ...Conf.caches.favicon, gauge: cachedFaviconsSizeGauge },
);

async function queryFavicon(
  kysely: Kysely<DittoTables>,
  domain: string,
): Promise<DittoTables['domain_favicons'] | undefined> {
  return await kysely
    .selectFrom('domain_favicons')
    .selectAll()
    .where('domain', '=', domain)
    .executeTakeFirst();
}

async function insertFavicon(kysely: Kysely<DittoTables>, domain: string, favicon: string): Promise<void> {
  await kysely
    .insertInto('domain_favicons')
    .values({ domain, favicon, last_updated_at: nostrNow() })
    .onConflict((oc) => oc.column('domain').doUpdateSet({ favicon, last_updated_at: nostrNow() }))
    .execute();
}

async function fetchFavicon(domain: string, signal?: AbortSignal): Promise<URL> {
  logi({ level: 'info', ns: 'ditto.favicon', domain, state: 'started' });
  const tld = tldts.parse(domain);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid favicon domain: ${domain}`);
  }

  const rootUrl = new URL('/', `https://${domain}/`);
  const response = await safeFetch(rootUrl, { signal });
  const html = await response.text();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const link = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');

  if (link) {
    const href = link.getAttribute('href');
    if (href) {
      let url: URL | undefined;

      try {
        url = new URL(href);
      } catch {
        try {
          url = new URL(href, rootUrl);
        } catch {
          // fall through
        }
      }

      if (url) {
        logi({ level: 'info', ns: 'ditto.favicon', domain, state: 'found', url });
        return url;
      }
    }
  }

  // Fallback to checking `/favicon.ico` of the domain.
  const url = new URL('/favicon.ico', `https://${domain}/`);
  const fallback = await safeFetch(url, { method: 'HEAD', signal });
  const contentType = fallback.headers.get('content-type');

  if (fallback.ok && ['image/vnd.microsoft.icon', 'image/x-icon'].includes(contentType!)) {
    logi({ level: 'info', ns: 'ditto.favicon', domain, state: 'found', url });
    return url;
  }

  logi({ level: 'info', ns: 'ditto.favicon', domain, state: 'failed' });

  throw new Error(`Favicon not found: ${domain}`);
}

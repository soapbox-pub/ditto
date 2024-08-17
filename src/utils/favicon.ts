import { DOMParser } from '@b-fuze/deno-dom/native';
import Debug from '@soapbox/stickynotes/debug';
import tldts from 'tldts';

import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:favicon');

const faviconCache = new SimpleLRU<string, URL>(
  async (key, { signal }) => {
    debug(`Fetching favicon ${key}`);
    const tld = tldts.parse(key);

    if (!tld.isIcann || tld.isIp || tld.isPrivate) {
      throw new Error(`Invalid favicon domain: ${key}`);
    }

    const rootUrl = new URL('/', `https://${key}/`);
    const response = await fetchWorker(rootUrl, { signal });
    const html = await response.text();

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const link = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');

    if (link) {
      const href = link.getAttribute('href');
      if (href) {
        try {
          return new URL(href);
        } catch {
          return new URL(href, rootUrl);
        }
      }
    }

    throw new Error(`Favicon not found: ${key}`);
  },
  { max: 500, ttl: Time.hours(1) },
);

export { faviconCache };

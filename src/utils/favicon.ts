import { DOMParser } from '@b-fuze/deno-dom';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { cachedFaviconsSizeGauge } from '@/metrics.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';

const faviconCache = new SimpleLRU<string, URL>(
  async (domain, { signal }) => {
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

    logi({ level: 'info', ns: 'ditto.favicon', domain, state: 'failed' });

    throw new Error(`Favicon not found: ${domain}`);
  },
  { ...Conf.caches.favicon, gauge: cachedFaviconsSizeGauge },
);

export { faviconCache };

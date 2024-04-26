import { LNURL, LNURLDetails } from '@nostrify/nostrify/ln';
import { Debug } from '@/deps.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:lnurl');

const lnurlCache = new SimpleLRU<string, LNURLDetails>(
  async (lnurl, { signal }) => {
    debug(`Lookup ${lnurl}`);
    try {
      const result = await LNURL.lookup(lnurl, { fetch: fetchWorker, signal });
      debug(`Found: ${lnurl}`);
      return result;
    } catch (e) {
      debug(`Not found: ${lnurl}`);
      throw e;
    }
  },
  { max: 1000, ttl: Time.minutes(30) },
);

/** Get an LNURL from a lud06 or lud16. */
function getLnurl({ lud06, lud16 }: { lud06?: string; lud16?: string }, limit?: number): string | undefined {
  if (lud06) return lud06;
  if (lud16) {
    const [name, host] = lud16.split('@');
    if (name && host) {
      const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`);
      return LNURL.encode(url, limit);
    }
  }
}

export { getLnurl, lnurlCache };

import { cachedLnurlsSizeGauge } from '@ditto/metrics';
import { NostrEvent } from '@nostrify/nostrify';
import { LNURL, LNURLDetails } from '@nostrify/nostrify/ln';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import { JsonValue } from '@std/json';

import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { errorJson } from '@/utils/log.ts';
import { Time } from '@/utils/time.ts';

const lnurlCache = new SimpleLRU<string, LNURLDetails>(
  async (lnurl, { signal }) => {
    logi({ level: 'info', ns: 'ditto.lnurl', lnurl, state: 'started' });
    try {
      const details = await LNURL.lookup(lnurl, { fetch: safeFetch, signal });
      logi({ level: 'info', ns: 'ditto.lnurl', lnurl, state: 'found', details: details as unknown as JsonValue });
      return details;
    } catch (e) {
      logi({ level: 'info', ns: 'ditto.lnurl', lnurl, state: 'failed', error: errorJson(e) });
      throw e;
    }
  },
  { max: 1000, ttl: Time.minutes(30), gauge: cachedLnurlsSizeGauge },
);

/** Get an LNURL from a lud06 or lud16. */
function getLnurl({ lud06, lud16 }: { lud06?: string; lud16?: string }, limit?: number): string | undefined {
  if (lud06) return lud06;
  if (lud16) {
    const [name, host] = lud16.split('@');
    if (name && host) {
      try {
        const url = new URL(`/.well-known/lnurlp/${name}`, `https://${host}`);
        return LNURL.encode(url, limit);
      } catch {
        return;
      }
    }
  }
}

interface CallbackParams {
  amount: number;
  nostr: NostrEvent;
  lnurl: string;
}

async function getInvoice(params: CallbackParams, signal?: AbortSignal): Promise<string> {
  const { amount, lnurl } = params;

  const details = await lnurlCache.fetch(lnurl, { signal });

  if (details.tag !== 'payRequest' || !details.allowsNostr || !details.nostrPubkey) {
    throw new Error('invalid lnurl');
  }

  if (amount > details.maxSendable || amount < details.minSendable) {
    throw new Error('amount out of range');
  }

  const { pr } = await LNURL.callback(
    details.callback,
    params,
    { fetch: safeFetch, signal },
  );

  return pr;
}

export { getInvoice, getLnurl, lnurlCache };

import { nip19 } from 'nostr-tools';
import { NIP05, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { cachedNip05sSizeGauge } from '@/metrics.ts';
import { Storages } from '@/storages.ts';
import { errorJson } from '@/utils/log.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Nip05, parseNip05 } from '@/utils.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (nip05, { signal }) => {
    const tld = tldts.parse(nip05);

    if (!tld.isIcann || tld.isIp || tld.isPrivate) {
      throw new Error(`Invalid NIP-05: ${nip05}`);
    }

    const [name, domain] = nip05.split('@');

    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'started' });

    try {
      if (domain === Conf.url.host) {
        const store = await Storages.db();
        const pointer = await localNip05Lookup(store, name);
        if (pointer) {
          logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', pubkey: pointer.pubkey });
          return pointer;
        } else {
          throw new Error(`Not found: ${nip05}`);
        }
      } else {
        const result = await NIP05.lookup(nip05, { fetch: fetchWorker, signal });
        logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', pubkey: result.pubkey });
        return result;
      }
    } catch (e) {
      logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'failed', error: errorJson(e) });
      throw e;
    }
  },
  { ...Conf.caches.nip05, gauge: cachedNip05sSizeGauge },
);

async function localNip05Lookup(store: NStore, localpart: string): Promise<nip19.ProfilePointer | undefined> {
  const [grant] = await store.query([{
    kinds: [30360],
    '#d': [`${localpart}@${Conf.url.host}`],
    authors: [Conf.pubkey],
    limit: 1,
  }]);

  const pubkey = grant?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    return { pubkey, relays: [Conf.relay] };
  }
}

export async function parseAndVerifyNip05(
  nip05: string | undefined,
  pubkey: string,
  signal = AbortSignal.timeout(3000),
): Promise<Nip05 | undefined> {
  if (!nip05) return;
  try {
    const result = await nip05Cache.fetch(nip05, { signal });
    if (result.pubkey === pubkey) {
      return parseNip05(nip05);
    }
  } catch (_e) {
    // do nothing
  }
}

export { localNip05Lookup, nip05Cache };

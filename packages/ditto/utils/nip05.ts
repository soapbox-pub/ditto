import { cachedNip05sSizeGauge } from '@ditto/metrics';
import { NIP05, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';
import { safeFetch } from '@soapbox/safe-fetch';
import { nip19 } from 'nostr-tools';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { errorJson } from '@/utils/log.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';

export const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (nip05, { signal }) => {
    const store = await Storages.db();
    return getNip05(store, nip05, signal);
  },
  { ...Conf.caches.nip05, gauge: cachedNip05sSizeGauge },
);

async function getNip05(
  store: NStore,
  nip05: string,
  signal?: AbortSignal,
): Promise<nip19.ProfilePointer> {
  const tld = tldts.parse(nip05);

  if (!tld.isIcann || tld.isIp || tld.isPrivate) {
    throw new Error(`Invalid NIP-05: ${nip05}`);
  }

  logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'started' });

  const [name, domain] = nip05.split('@');

  try {
    if (domain === Conf.url.host) {
      const pointer = await localNip05Lookup(store, name);
      if (pointer) {
        logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'local', pubkey: pointer.pubkey });
        return pointer;
      } else {
        throw new Error(`Not found: ${nip05}`);
      }
    } else {
      const pointer = await NIP05.lookup(nip05, { fetch: safeFetch, signal });
      logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'found', source: 'fetch', pubkey: pointer.pubkey });
      return pointer;
    }
  } catch (e) {
    logi({ level: 'info', ns: 'ditto.nip05', nip05, state: 'failed', error: errorJson(e) });
    throw e;
  }
}

export async function localNip05Lookup(store: NStore, localpart: string): Promise<nip19.ProfilePointer | undefined> {
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

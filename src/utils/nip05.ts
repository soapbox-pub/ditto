import { nip19 } from 'nostr-tools';
import { NIP05, NStore } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import tldts from 'tldts';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { Nip05, parseNip05 } from '@/utils.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:nip05');

const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (key, { signal }) => {
    debug(`Lookup ${key}`);
    const tld = tldts.parse(key);

    if (!tld.isIcann || tld.isIp || tld.isPrivate) {
      throw new Error(`Invalid NIP-05: ${key}`);
    }

    const [name, domain] = key.split('@');

    try {
      if (domain === Conf.url.host) {
        const store = await Storages.db();
        const pointer = await localNip05Lookup(store, name);
        if (pointer) {
          debug(`Found: ${key} is ${pointer.pubkey}`);
          return pointer;
        } else {
          throw new Error(`Not found: ${key}`);
        }
      } else {
        const result = await NIP05.lookup(key, { fetch: fetchWorker, signal });
        debug(`Found: ${key} is ${result.pubkey}`);
        return result;
      }
    } catch (e) {
      debug(`Not found: ${key}`);
      throw e;
    }
  },
  { max: 500, ttl: Time.hours(1) },
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

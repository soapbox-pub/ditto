import { NIP05 } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';
import { nip19 } from 'nostr-tools';

import { Conf } from '@/config.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { Storages } from '@/storages.ts';
import { fetchWorker } from '@/workers/fetch.ts';

const debug = Debug('ditto:nip05');

const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (key, { signal }) => {
    debug(`Lookup ${key}`);
    const [name, domain] = key.split('@');
    try {
      if (domain === Conf.url.host) {
        const pointer = await localNip05Lookup(name);
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

async function localNip05Lookup(name: string): Promise<nip19.ProfilePointer | undefined> {
  const [label] = await Storages.db.query([{
    kinds: [1985],
    authors: [Conf.pubkey],
    '#L': ['nip05'],
    '#l': [`${name}@${Conf.url.host}`],
    limit: 1,
  }]);

  const pubkey = label?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    return { pubkey, relays: [Conf.relay] };
  }
}

export { localNip05Lookup, nip05Cache };

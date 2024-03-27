import { Conf } from '@/config.ts';
import { Debug, NIP05, nip19 } from '@/deps.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';
import { eventsDB } from '@/storages.ts';

const debug = Debug('ditto:nip05');

const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (key, { signal }) => {
    debug(`Lookup ${key}`);
    const [name, domain] = key.split('@');
    try {
      if (domain === Conf.url.host) {
        return localNip05Lookup(name);
      } else {
        const result = await NIP05.lookup(key, { fetch, signal });
        debug(`Found: ${key} is ${result.pubkey}`);
        return result;
      }
    } catch (e) {
      debug(`Not found: ${key}`);
      throw e;
    }
  },
  { max: 5000, ttl: Time.hours(1) },
);

async function localNip05Lookup(name: string): Promise<nip19.ProfilePointer> {
  const { host } = Conf.url;

  const [label] = await eventsDB.query([{
    kinds: [1985],
    authors: [Conf.pubkey],
    '#L': ['nip05'],
    '#l': [`${name}@${host}`],
  }]);

  const pubkey = label?.tags.find(([name]) => name === 'p')?.[1];

  if (pubkey) {
    debug(`Found: ${name} is ${pubkey}`);
    return { pubkey, relays: [Conf.relay] };
  }

  debug(`Not found: ${name}`);
  throw new Error('Not found');
}

export { nip05Cache };

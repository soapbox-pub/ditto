import { Debug, NIP05, nip19 } from '@/deps.ts';
import { SimpleLRU } from '@/utils/SimpleLRU.ts';
import { Time } from '@/utils/time.ts';

const debug = Debug('ditto:nip05');

const nip05Cache = new SimpleLRU<string, nip19.ProfilePointer>(
  async (key, { signal }) => {
    debug(`Lookup ${key}`);
    try {
      const result = await NIP05.lookup(key, { fetch, signal });
      debug(`Found: ${key} is ${result.pubkey}`);
      return result;
    } catch (e) {
      debug(`Not found: ${key}`);
      throw e;
    }
  },
  { max: 5000, ttl: Time.hours(1) },
);

export { nip05Cache };

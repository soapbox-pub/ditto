import { DittoConf } from '@ditto/conf';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { PolicyWorker } from './policy.ts';

Deno.test('PolicyWorker', () => {
  const conf = new DittoConf(
    new Map([
      ['DITTO_NSEC', nip19.nsecEncode(generateSecretKey())],
    ]),
  );

  new PolicyWorker(conf);
});

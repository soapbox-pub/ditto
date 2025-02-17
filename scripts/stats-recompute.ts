import { nip19 } from 'nostr-tools';

import { Storages } from '../packages/ditto/storages.ts';
import { refreshAuthorStats } from '../packages/ditto/utils/stats.ts';

let pubkey: string;
try {
  const result = nip19.decode(Deno.args[0]);
  if (result.type === 'npub') {
    pubkey = result.data;
  } else {
    throw new Error('Invalid npub');
  }
} catch {
  console.error('Invalid npub');
  Deno.exit(1);
}

const store = await Storages.db();
const kysely = await Storages.kysely();

await refreshAuthorStats({ pubkey, kysely, store });

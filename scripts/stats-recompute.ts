import { nip19 } from 'nostr-tools';

import { DittoDB } from '@/db/DittoDB.ts';
import { Storages } from '@/storages.ts';
import { refreshAuthorStats } from '@/utils/stats.ts';

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
const { kysely } = await DittoDB.getInstance();

await refreshAuthorStats({ pubkey, kysely, store });

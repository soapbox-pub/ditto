import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { nip19 } from 'nostr-tools';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import { refreshAuthorStats } from '../packages/ditto/utils/stats.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });

const { kysely } = db;

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

await refreshAuthorStats({ pubkey, kysely, relay });

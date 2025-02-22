import { Semaphore } from '@core/asyncutil';
import { NostrEvent } from '@nostrify/nostrify';
import { MockRelay } from '@nostrify/nostrify/test';

import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';

import { DittoAPIStore } from '../packages/ditto/storages/DittoAPIStore.ts';
import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);

const pgstore = new DittoPgStore({ db, pubkey: await conf.signer.getPublicKey() });
const apistore = new DittoAPIStore({ conf, db, relay: pgstore, pool: new MockRelay() });

const sem = new Semaphore(5);

const query = db.kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig'])
  .where('kind', '=', 0);

for await (const row of query.stream(100)) {
  while (sem.locked) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  sem.lock(async () => {
    const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
    await apistore.updateAuthorData(event, AbortSignal.timeout(3000));
  });
}

Deno.exit();

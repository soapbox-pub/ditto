import { Semaphore } from '@core/asyncutil';
import { NostrEvent } from '@nostrify/nostrify';
import { MockRelay } from '@nostrify/nostrify/test';

import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import { DittoRelayStore } from '../packages/ditto/storages/DittoRelayStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);

const pgstore = new DittoPgStore({ db, conf });
const relaystore = new DittoRelayStore({ conf, db, pool: new MockRelay(), relay: pgstore });

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
    await relaystore.updateAuthorData(event, AbortSignal.timeout(3000));
  });
}

Deno.exit();

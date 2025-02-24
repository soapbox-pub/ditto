import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NostrEvent } from '@nostrify/nostrify';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);

const query = db.kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig']);

for await (const row of query.stream()) {
  const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
  const ext = DittoPgStore.indexExtensions(event);

  try {
    await db.kysely
      .updateTable('nostr_events')
      .set('search_ext', ext)
      .where('id', '=', event.id)
      .execute();
  } catch {
    // do nothing
  }
}

Deno.exit();

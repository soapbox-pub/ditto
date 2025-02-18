import { NostrEvent } from '@nostrify/nostrify';

import { Storages } from '../packages/ditto/storages.ts';
import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const kysely = await Storages.kysely();

const query = kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig']);

for await (const row of query.stream()) {
  const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
  const ext = DittoPgStore.indexExtensions(event);

  try {
    await kysely
      .updateTable('nostr_events')
      .set('search_ext', ext)
      .where('id', '=', event.id)
      .execute();
  } catch {
    // do nothing
  }
}

Deno.exit();

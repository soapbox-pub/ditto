import { NostrEvent } from '@nostrify/nostrify';

import { Storages } from '../packages/ditto/storages.ts';
import { EventsDB } from '../packages/ditto/storages/EventsDB.ts';

const kysely = await Storages.kysely();

const query = kysely
  .selectFrom('nostr_events')
  .select(['id', 'kind', 'content', 'pubkey', 'tags', 'created_at', 'sig']);

for await (const row of query.stream()) {
  const event: NostrEvent = { ...row, created_at: Number(row.created_at) };
  const ext = EventsDB.indexExtensions(event);

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

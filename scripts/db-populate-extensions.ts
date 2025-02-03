import { Storages } from '@/storages.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

const store = await Storages.db();
const kysely = await Storages.kysely();

for await (const msg of store.req([{}])) {
  if (msg[0] === 'EVENT') {
    const event = msg[2];

    const ext = EventsDB.indexExtensions(event);

    try {
      await kysely.updateTable('nostr_events')
        .set('search_ext', ext)
        .where('id', '=', event.id)
        .execute();
    } catch {
      // do nothing
    }
  } else {
    break;
  }
}

Deno.exit();

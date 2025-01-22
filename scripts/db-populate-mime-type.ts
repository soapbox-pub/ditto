import { Storages } from '@/storages.ts';

const store = await Storages.db();
const kysely = await Storages.kysely();

for await (const msg of store.req([{ kinds: [1] }])) { // Only kind 1 can contain media in Ditto?
  if (msg[0] === 'EVENT') {
    const event = msg[2];

    const imeta = event.tags.find(([value]) => value === 'imeta');
    if (!imeta) continue;

    const mime_type = imeta.find((value) => value?.split(' ')[0] === 'm')?.split(' ')[1];
    if (!mime_type) continue;

    try {
      await kysely.updateTable('nostr_events')
        .set('mime_type', mime_type)
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

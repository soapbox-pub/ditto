import { NSchema as n } from '@nostrify/nostrify';
import { Storages } from '@/storages.ts';

const store = await Storages.db();
const kysely = await Storages.kysely();

for await (const msg of store.req([{ kinds: [0] }])) {
  if (msg[0] === 'EVENT') {
    const { pubkey, content } = msg[2];

    const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(content);
    const search = [name, nip05].filter(Boolean).join(' ').trim();

    try {
      await kysely.insertInto('author_search').values({
        pubkey,
        search,
      }).onConflict(
        (oc) =>
          oc.column('pubkey')
            .doUpdateSet((eb) => ({ search: eb.ref('excluded.search') })),
      )
        .execute();
    } catch {
      // do nothing
    }
  } else {
    break;
  }
}

Deno.exit();

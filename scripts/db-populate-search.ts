import { NSchema as n } from '@nostrify/nostrify';
import { Storages } from '@/storages.ts';
import { DittoTables } from '@/db/DittoTables.ts';

const store = await Storages.db();
const kysely = await Storages.kysely();

const values: DittoTables['author_search'][] = [];

for await (const msg of store.req([{ kinds: [0] }])) {
  if (msg[0] === 'EVENT') {
    const { pubkey, content } = msg[2];

    const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(content);
    const search = [name, nip05].filter(Boolean).join(' ').trim();

    values.push({
      pubkey: pubkey,
      search,
    });
  }
}

try {
  await kysely.insertInto('author_search').values(values).onConflict(
    (oc) =>
      oc.column('pubkey')
        .doUpdateSet((eb) => ({ search: eb.ref('excluded.search') })),
  )
    .execute();
} catch {
  // do nothing
}

Deno.exit();

import { NSchema as n } from '@nostrify/nostrify';
import { Storages } from '@/storages.ts';
import { DittoTables } from '@/db/DittoTables.ts';

const kysely = await Storages.kysely();
const stream = kysely
  .selectFrom('nostr_events')
  .select(['pubkey', 'content'])
  .where('kind', '=', 0)
  .stream();

const values: DittoTables['author_search'][] = [];

for await (const author of stream) {
  const { name, nip05 } = n.json().pipe(n.metadata()).catch({}).parse(author.content);
  const search = [name, nip05].filter(Boolean).join(' ').trim();

  values.push({
    pubkey: author.pubkey,
    search,
  });
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

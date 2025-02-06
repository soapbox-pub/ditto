import { Storages } from '@/storages.ts';

const kysely = await Storages.kysely();
const statsQuery = kysely.selectFrom('author_stats').select('pubkey');

for await (const { pubkey } of statsQuery.stream(10)) {
  const eventsQuery = kysely
    .selectFrom('nostr_events')
    .select('created_at')
    .where('pubkey', '=', pubkey)
    .where('kind', 'in', [1, 20, 1111, 30023])
    .orderBy('nostr_events.created_at', 'desc')
    .orderBy('nostr_events.id', 'asc');

  let end: number | null = null;
  let start: number | null = null;

  for await (const { created_at } of eventsQuery.stream(20)) {
    const createdAt = Number(created_at);

    if (!end) {
      const now = Math.floor(Date.now() / 1000);

      if (now - createdAt > 86400) {
        break; // streak broken
      }

      end = createdAt;
    }

    if (start && (start - createdAt > 86400)) {
      break; // streak broken
    }

    start = createdAt;
  }

  await kysely
    .updateTable('author_stats')
    .set({
      streak_end: end,
      streak_start: start,
    })
    .where('pubkey', '=', pubkey)
    .execute();
}

Deno.exit();

import { NostrEvent, NStore } from '@nostrify/nostrify';
import { Kysely, UpdateObject } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';
import { getTagSet } from '@/utils/tags.ts';

interface UpdateStatsOpts {
  kysely: Kysely<DittoTables>;
  store: NStore;
  event: NostrEvent;
}

/** Handle one event at a time and update relevant stats for it. */
// deno-lint-ignore require-await
export async function updateStats({ event, kysely, store }: UpdateStatsOpts): Promise<void> {
  switch (event.kind) {
    case 1:
      return handleEvent1(kysely, event);
    case 3:
      return handleEvent3(kysely, store, event);
    case 6:
      return handleEvent6(kysely, event);
    case 7:
      return handleEvent7(kysely, event);
  }
}

/** Update stats for kind 1 event. */
async function handleEvent1(kysely: Kysely<DittoTables>, event: NostrEvent): Promise<void> {
  await updateAuthorStats(kysely, event.pubkey, ({ notes_count }) => ({ notes_count: notes_count + 1 }));
}

/** Update stats for kind 3 event. */
async function handleEvent3(kysely: Kysely<DittoTables>, store: NStore, event: NostrEvent): Promise<void> {
  const following = getTagSet(event.tags, 'p');

  await updateAuthorStats(kysely, event.pubkey, () => ({ following_count: following.size }));

  const [prev] = await store.query([
    { kinds: [3], authors: [event.pubkey], limit: 1 },
  ]);

  const { added, removed } = getFollowDiff(event.tags, prev?.tags);

  for (const pubkey of added) {
    await updateAuthorStats(kysely, pubkey, ({ followers_count }) => ({ followers_count: followers_count + 1 }));
  }

  for (const pubkey of removed) {
    await updateAuthorStats(kysely, pubkey, ({ followers_count }) => ({ followers_count: followers_count - 1 }));
  }
}

/** Update stats for kind 6 event. */
async function handleEvent6(kysely: Kysely<DittoTables>, event: NostrEvent): Promise<void> {
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (id) {
    await updateEventStats(kysely, id, ({ reposts_count }) => ({ reposts_count: reposts_count + 1 }));
  }
}

/** Update stats for kind 7 event. */
async function handleEvent7(kysely: Kysely<DittoTables>, event: NostrEvent): Promise<void> {
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (id) {
    await updateEventStats(kysely, id, ({ reactions_count }) => ({ reactions_count: reactions_count + 1 }));
  }
}

/** Get the pubkeys that were added and removed from a follow event. */
export function getFollowDiff(
  tags: string[][],
  prevTags: string[][] = [],
): { added: Set<string>; removed: Set<string> } {
  const pubkeys = getTagSet(tags, 'p');
  const prevPubkeys = getTagSet(prevTags, 'p');

  return {
    added: pubkeys.difference(prevPubkeys),
    removed: prevPubkeys.difference(pubkeys),
  };
}

/** Retrieve the author stats by the pubkey, then call the callback to update it. */
export async function updateAuthorStats(
  kysely: Kysely<DittoTables>,
  pubkey: string,
  fn: (prev: DittoTables['author_stats']) => UpdateObject<DittoTables, 'author_stats'>,
): Promise<void> {
  const empty = {
    pubkey,
    followers_count: 0,
    following_count: 0,
    notes_count: 0,
  };

  const prev = await kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', pubkey)
    .executeTakeFirst();

  const stats = fn(prev ?? empty);

  if (prev) {
    await kysely.updateTable('author_stats')
      .set(stats)
      .where('pubkey', '=', pubkey)
      .execute();
  } else {
    await kysely.insertInto('author_stats')
      .values({
        ...empty,
        ...stats,
      })
      .execute();
  }
}

/** Retrieve the event stats by the event ID, then call the callback to update it. */
export async function updateEventStats(
  kysely: Kysely<DittoTables>,
  eventId: string,
  fn: (prev: DittoTables['event_stats']) => UpdateObject<DittoTables, 'event_stats'>,
): Promise<void> {
  const empty = {
    event_id: eventId,
    replies_count: 0,
    reposts_count: 0,
    reactions_count: 0,
  };

  const prev = await kysely
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', '=', eventId)
    .executeTakeFirst();

  const stats = fn(prev ?? empty);

  if (prev) {
    await kysely.updateTable('event_stats')
      .set(stats)
      .where('event_id', '=', eventId)
      .execute();
  } else {
    await kysely.insertInto('event_stats')
      .values({
        ...empty,
        ...stats,
      })
      .execute();
  }
}

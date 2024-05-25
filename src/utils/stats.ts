import { Semaphore } from '@lambdalisue/async';
import { NostrEvent, NStore } from '@nostrify/nostrify';
import { Kysely, UpdateObject } from 'kysely';
import { LRUCache } from 'lru-cache';
import { SetRequired } from 'type-fest';

import { DittoTables } from '@/db/DittoTables.ts';
import { getTagSet } from '@/utils/tags.ts';
import { Conf } from '@/config.ts';

interface UpdateStatsOpts {
  kysely: Kysely<DittoTables>;
  store: NStore;
  event: NostrEvent;
  x?: 1 | -1;
}

/** Handle one event at a time and update relevant stats for it. */
// deno-lint-ignore require-await
export async function updateStats({ event, kysely, store, x = 1 }: UpdateStatsOpts): Promise<void> {
  switch (event.kind) {
    case 1:
      return handleEvent1(kysely, event, x);
    case 3:
      return handleEvent3(kysely, event, x, store);
    case 5:
      return handleEvent5(kysely, event, -1, store);
    case 6:
      return handleEvent6(kysely, event, x);
    case 7:
      return handleEvent7(kysely, event, x);
  }
}

/** Update stats for kind 1 event. */
async function handleEvent1(kysely: Kysely<DittoTables>, event: NostrEvent, x: number): Promise<void> {
  await updateAuthorStats(kysely, event.pubkey, ({ notes_count }) => ({ notes_count: Math.max(0, notes_count + x) }));
}

/** Update stats for kind 3 event. */
async function handleEvent3(kysely: Kysely<DittoTables>, event: NostrEvent, x: number, store: NStore): Promise<void> {
  const following = getTagSet(event.tags, 'p');

  await updateAuthorStats(kysely, event.pubkey, () => ({ following_count: following.size }));

  const [prev] = await store.query([
    { kinds: [3], authors: [event.pubkey], limit: 1 },
  ]);

  const { added, removed } = getFollowDiff(event.tags, prev?.tags);

  for (const pubkey of added) {
    await updateAuthorStats(
      kysely,
      pubkey,
      ({ followers_count }) => ({ followers_count: Math.max(0, followers_count + x) }),
    );
  }

  for (const pubkey of removed) {
    await updateAuthorStats(
      kysely,
      pubkey,
      ({ followers_count }) => ({ followers_count: Math.max(0, followers_count - x) }),
    );
  }
}

/** Update stats for kind 5 event. */
async function handleEvent5(kysely: Kysely<DittoTables>, event: NostrEvent, x: -1, store: NStore): Promise<void> {
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (id) {
    const [target] = await store.query([{ ids: [id], authors: [event.pubkey], limit: 1 }]);
    if (target) {
      await updateStats({ event: target, kysely, store, x });
    }
  }
}

/** Update stats for kind 6 event. */
async function handleEvent6(kysely: Kysely<DittoTables>, event: NostrEvent, x: number): Promise<void> {
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (id) {
    await updateEventStats(kysely, id, ({ reposts_count }) => ({ reposts_count: Math.max(0, reposts_count + x) }));
  }
}

/** Update stats for kind 7 event. */
async function handleEvent7(kysely: Kysely<DittoTables>, event: NostrEvent, x: number): Promise<void> {
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  const emoji = event.content;

  if (id && emoji && (['+', '-'].includes(emoji) || /^\p{RGI_Emoji}$/v.test(emoji))) {
    await updateEventStats(kysely, id, ({ reactions }) => {
      const data: Record<string, number> = JSON.parse(reactions);

      // Increment or decrement the emoji count.
      data[emoji] = (data[emoji] ?? 0) + x;

      // Remove reactions with a count of 0 or less.
      for (const key of Object.keys(data)) {
        if (data[key] < 1) {
          delete data[key];
        }
      }

      // Total reactions count.
      const count = Object.values(data).reduce((result, value) => result + value, 0);

      return {
        reactions: JSON.stringify(data),
        reactions_count: count,
      };
    });
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

/** Retrieve the author stats by the pubkey. */
export function getAuthorStats(
  kysely: Kysely<DittoTables>,
  pubkey: string,
): Promise<DittoTables['author_stats'] | undefined> {
  return kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', pubkey)
    .executeTakeFirst();
}

/** Retrieve the author stats by the pubkey, then call the callback to update it. */
export async function updateAuthorStats(
  kysely: Kysely<DittoTables>,
  pubkey: string,
  fn: (prev: DittoTables['author_stats']) => UpdateObject<DittoTables, 'author_stats'>,
): Promise<void> {
  const empty: DittoTables['author_stats'] = {
    pubkey,
    followers_count: 0,
    following_count: 0,
    notes_count: 0,
  };

  let query = kysely
    .selectFrom('author_stats')
    .selectAll()
    .where('pubkey', '=', pubkey);

  if (Conf.db.dialect === 'postgres') {
    query = query.forUpdate();
  }

  const prev = await query.executeTakeFirst();
  const stats = fn(prev ?? empty);

  if (prev) {
    await kysely.updateTable('author_stats')
      .set(stats)
      .where('pubkey', '=', pubkey)
      .execute();
  } else {
    await kysely.insertInto('author_stats')
      .values({ ...empty, ...stats })
      .execute();
  }
}

/** Retrieve the event stats by the event ID. */
export function getEventStats(
  kysely: Kysely<DittoTables>,
  eventId: string,
): Promise<DittoTables['event_stats'] | undefined> {
  return kysely
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', '=', eventId)
    .executeTakeFirst();
}

/** Retrieve the event stats by the event ID, then call the callback to update it. */
export async function updateEventStats(
  kysely: Kysely<DittoTables>,
  eventId: string,
  fn: (prev: DittoTables['event_stats']) => UpdateObject<DittoTables, 'event_stats'>,
): Promise<void> {
  const empty: DittoTables['event_stats'] = {
    event_id: eventId,
    replies_count: 0,
    reposts_count: 0,
    reactions_count: 0,
    reactions: '{}',
  };

  let query = kysely
    .selectFrom('event_stats')
    .selectAll()
    .where('event_id', '=', eventId);

  if (Conf.db.dialect === 'postgres') {
    query = query.forUpdate();
  }

  const prev = await query.executeTakeFirst();
  const stats = fn(prev ?? empty);

  if (prev) {
    await kysely.updateTable('event_stats')
      .set(stats)
      .where('event_id', '=', eventId)
      .execute();
  } else {
    await kysely.insertInto('event_stats')
      .values({ ...empty, ...stats })
      .execute();
  }
}

/** Calculate author stats from the database. */
export async function countAuthorStats(
  store: SetRequired<NStore, 'count'>,
  pubkey: string,
): Promise<DittoTables['author_stats']> {
  const [{ count: followers_count }, { count: notes_count }, [followList]] = await Promise.all([
    store.count([{ kinds: [3], '#p': [pubkey] }]),
    store.count([{ kinds: [1], authors: [pubkey] }]),
    store.query([{ kinds: [3], authors: [pubkey], limit: 1 }]),
  ]);

  return {
    pubkey,
    followers_count,
    following_count: getTagSet(followList?.tags ?? [], 'p').size,
    notes_count,
  };
}

export interface RefreshAuthorStatsOpts {
  pubkey: string;
  kysely: Kysely<DittoTables>;
  store: SetRequired<NStore, 'count'>;
}

/** Refresh the author's stats in the database. */
export async function refreshAuthorStats(
  { pubkey, kysely, store }: RefreshAuthorStatsOpts,
): Promise<DittoTables['author_stats']> {
  const stats = await countAuthorStats(store, pubkey);

  await kysely.insertInto('author_stats')
    .values(stats)
    .onConflict((oc) => oc.column('pubkey').doUpdateSet(stats))
    .execute();

  return stats;
}

const authorStatsSemaphore = new Semaphore(10);
const refreshedAuthors = new LRUCache<string, true>({ max: 1000 });

/** Calls `refreshAuthorStats` only once per author. */
export function refreshAuthorStatsDebounced(opts: RefreshAuthorStatsOpts): void {
  if (refreshedAuthors.get(opts.pubkey)) {
    return;
  }

  refreshedAuthors.set(opts.pubkey, true);

  authorStatsSemaphore
    .lock(() => refreshAuthorStats(opts).catch(() => {}));
}

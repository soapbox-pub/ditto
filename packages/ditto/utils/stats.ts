import { type Proof } from '@cashu/cashu-ts';
import { proofSchema } from '@ditto/cashu';
import { DittoTables } from '@ditto/db';
import { NostrEvent, NSchema as n, NStore } from '@nostrify/nostrify';
import { Insertable, Kysely, UpdateObject } from 'kysely';
import { SetRequired } from 'type-fest';
import { z } from 'zod';

import { findQuoteTag, findReplyTag, getTagSet } from '@/utils/tags.ts';

import type { DittoConf } from '@ditto/conf';
import { parseEmojiInput } from '@/utils/custom-emoji.ts';

interface UpdateStatsOpts {
  conf: DittoConf;
  relay: NStore;
  kysely: Kysely<DittoTables>;
  event: NostrEvent;
  x?: 1 | -1;
}

/** Handle one event at a time and update relevant stats for it. */
// deno-lint-ignore require-await
export async function updateStats(opts: UpdateStatsOpts): Promise<void> {
  const { event } = opts;

  switch (event.kind) {
    case 1:
    case 20:
    case 1111:
    case 30023:
      return handleEvent1(opts);
    case 3:
      return handleEvent3(opts);
    case 5:
      return handleEvent5(opts);
    case 6:
      return handleEvent6(opts);
    case 7:
      return handleEvent7(opts);
    case 9735:
      return handleEvent9735(opts);
    case 9321:
      return handleEvent9321(opts);
  }
}

/** Update stats for kind 1 event. */
async function handleEvent1(opts: UpdateStatsOpts): Promise<void> {
  const { conf, kysely, event, x = 1 } = opts;

  await updateAuthorStats(kysely, event.pubkey, (prev) => {
    const now = event.created_at;

    let start = prev.streak_start;
    let end = prev.streak_end;

    if (start && end) { // Streak exists.
      if (now <= end) {
        // Streak cannot go backwards in time. Skip it.
      } else if (now - end > conf.streakWindow) {
        // Streak is broken. Start a new streak.
        start = now;
        end = now;
      } else {
        // Extend the streak.
        end = now;
      }
    } else { // New streak.
      start = now;
      end = now;
    }

    return {
      notes_count: Math.max(0, prev.notes_count + x),
      streak_start: start || null,
      streak_end: end || null,
    };
  });

  const replyId = findReplyTag(event.tags)?.[1];
  const quoteId = findQuoteTag(event.tags)?.[1];

  if (replyId) {
    await updateEventStats(
      kysely,
      replyId,
      ({ replies_count }) => ({ replies_count: Math.max(0, replies_count + x) }),
    );
  }

  if (quoteId) {
    await updateEventStats(
      kysely,
      quoteId,
      ({ quotes_count }) => ({ quotes_count: Math.max(0, quotes_count + x) }),
    );
  }
}

/** Update stats for kind 3 event. */
async function handleEvent3(opts: UpdateStatsOpts): Promise<void> {
  const { relay, kysely, event, x = 1 } = opts;

  const following = getTagSet(event.tags, 'p');

  await updateAuthorStats(kysely, event.pubkey, () => ({ following_count: following.size }));

  const [prev] = await relay.query([
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
async function handleEvent5(opts: UpdateStatsOpts): Promise<void> {
  const { relay, event, x = -1 } = opts;

  const id = event.tags.find(([name]) => name === 'e')?.[1];

  if (id) {
    const [target] = await relay.query([{ ids: [id], authors: [event.pubkey], limit: 1 }]);
    if (target) {
      await updateStats({ ...opts, event: target, x });
    }
  }
}

/** Update stats for kind 6 event. */
async function handleEvent6(opts: UpdateStatsOpts): Promise<void> {
  const { kysely, event, x = 1 } = opts;

  const id = event.tags.find(([name]) => name === 'e')?.[1];

  if (id) {
    await updateEventStats(kysely, id, ({ reposts_count }) => ({ reposts_count: Math.max(0, reposts_count + x) }));
  }
}

/** Update stats for kind 7 event. */
async function handleEvent7(opts: UpdateStatsOpts): Promise<void> {
  const { kysely, event, x = 1 } = opts;

  const id = event.tags.findLast(([name]) => name === 'e')?.[1];
  const result = parseEmojiInput(event.content);

  if (!id || !result) return;

  let url: URL | undefined;

  if (result.type === 'custom') {
    const tag = event.tags.find(([name, value]) => name === 'emoji' && value === result.shortcode);
    try {
      url = new URL(tag![2]);
    } catch {
      return;
    }
  }

  let key: string;
  switch (result.type) {
    case 'basic':
      key = result.value;
      break;
    case 'native':
      key = result.native;
      break;
    case 'custom':
      key = `${result.shortcode}:${url}`;
      break;
  }

  await updateEventStats(kysely, id, ({ reactions }) => {
    const data: Record<string, number> = JSON.parse(reactions);

    // Increment or decrement the emoji count.
    data[key] = (data[key] ?? 0) + x;

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

/** Update stats for kind 9735 event. */
async function handleEvent9735(opts: UpdateStatsOpts): Promise<void> {
  const { kysely, event } = opts;

  // https://github.com/nostr-protocol/nips/blob/master/57.md#appendix-f-validating-zap-receipts
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (!id) return;

  const amountSchema = z.coerce.number().int().nonnegative().catch(0);

  let amount = 0;
  try {
    const zapRequest = n.json().pipe(n.event()).parse(event.tags.find(([name]) => name === 'description')?.[1]);
    amount = amountSchema.parse(zapRequest.tags.find(([name]) => name === 'amount')?.[1]);
    if (amount <= 0) return;
  } catch {
    return;
  }

  await updateEventStats(
    kysely,
    id,
    ({ zaps_amount }) => ({ zaps_amount: Math.max(0, zaps_amount + amount) }),
  );
}

/** Update stats for kind 9321 event. */
async function handleEvent9321(opts: UpdateStatsOpts): Promise<void> {
  const { kysely, event } = opts;

  // https://github.com/nostr-protocol/nips/blob/master/61.md#nutzap-event
  // It's possible to nutzap a profile without nutzapping a post, but we don't care about this case
  const id = event.tags.find(([name]) => name === 'e')?.[1];
  if (!id) return;

  const proofs = (event.tags.filter(([name]) => name === 'proof').map(([_, proof]) => {
    const { success, data } = n.json().pipe(proofSchema).safeParse(proof);
    if (!success) return;

    return data;
  })
    .filter(Boolean)) as Proof[];

  const amount = proofs.reduce((prev, current) => prev + current.amount, 0);

  await updateEventStats(
    kysely,
    id,
    ({ zaps_amount_cashu }) => ({ zaps_amount_cashu: Math.max(0, zaps_amount_cashu + amount) }),
  );
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
  fn: (prev: Insertable<DittoTables['author_stats']>) => UpdateObject<DittoTables, 'author_stats'>,
): Promise<void> {
  const empty: Insertable<DittoTables['author_stats']> = {
    pubkey,
    followers_count: 0,
    following_count: 0,
    notes_count: 0,
    search: '',
  };

  const prev = await kysely
    .selectFrom('author_stats')
    .selectAll()
    .forUpdate()
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
    quotes_count: 0,
    zaps_amount: 0,
    zaps_amount_cashu: 0,
    reactions: '{}',
  };

  const prev = await kysely
    .selectFrom('event_stats')
    .selectAll()
    .forUpdate()
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
      .values({ ...empty, ...stats })
      .execute();
  }
}

/** Calculate author stats from the database. */
export async function countAuthorStats(
  { pubkey, relay }: RefreshAuthorStatsOpts,
): Promise<DittoTables['author_stats']> {
  const [{ count: followers_count }, { count: notes_count }, [followList], [kind0]] = await Promise.all([
    relay.count([{ kinds: [3], '#p': [pubkey] }]),
    relay.count([{ kinds: [1, 20], authors: [pubkey] }]),
    relay.query([{ kinds: [3], authors: [pubkey], limit: 1 }]),
    relay.query([{ kinds: [0], authors: [pubkey], limit: 1 }]),
  ]);
  let search: string = '';
  const metadata = n.json().pipe(n.metadata()).catch({}).safeParse(kind0?.content);
  if (metadata.success) {
    const { name, nip05 } = metadata.data;
    search = [name, nip05].filter(Boolean).join(' ').trim();
  }

  return {
    pubkey,
    followers_count,
    following_count: getTagSet(followList?.tags ?? [], 'p').size,
    notes_count,
    search,
    streak_start: null,
    streak_end: null,
    nip05: null,
    nip05_domain: null,
    nip05_hostname: null,
    nip05_last_verified_at: null,
  };
}

export interface RefreshAuthorStatsOpts {
  pubkey: string;
  kysely: Kysely<DittoTables>;
  relay: SetRequired<NStore, 'count'>;
}

/** Refresh the author's stats in the database. */
export async function refreshAuthorStats(
  { pubkey, kysely, relay }: RefreshAuthorStatsOpts,
): Promise<DittoTables['author_stats']> {
  const stats = await countAuthorStats({ relay, pubkey, kysely });

  await kysely.insertInto('author_stats')
    .values(stats)
    .onConflict((oc) => oc.column('pubkey').doUpdateSet(stats))
    .execute();

  return stats;
}

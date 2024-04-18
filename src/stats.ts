import { type AuthorStatsRow, db, type DittoDB, type EventStatsRow } from '@/db.ts';
import { Debug, type InsertQueryBuilder, type NostrEvent } from '@/deps.ts';
import { eventsDB } from '@/storages.ts';
import { findReplyTag } from '@/tags.ts';

type AuthorStat = keyof Omit<AuthorStatsRow, 'pubkey'>;
type EventStat = keyof Omit<EventStatsRow, 'event_id'>;

type AuthorStatDiff = ['author_stats', pubkey: string, stat: AuthorStat, diff: number];
type EventStatDiff = ['event_stats', eventId: string, stat: EventStat, diff: number];
type StatDiff = AuthorStatDiff | EventStatDiff;

const debug = Debug('ditto:stats');

/** Store stats for the event in LMDB. */
async function updateStats(event: NostrEvent) {
  let prev: NostrEvent | undefined;
  const queries: InsertQueryBuilder<DittoDB, any, unknown>[] = [];

  // Kind 3 is a special case - replace the count with the new list.
  if (event.kind === 3) {
    prev = await maybeGetPrev(event);
    if (!prev || event.created_at >= prev.created_at) {
      queries.push(updateFollowingCountQuery(event));
    }
  }

  const statDiffs = await getStatsDiff(event, prev);
  const pubkeyDiffs = statDiffs.filter(([table]) => table === 'author_stats') as AuthorStatDiff[];
  const eventDiffs = statDiffs.filter(([table]) => table === 'event_stats') as EventStatDiff[];

  if (statDiffs.length) {
    debug(JSON.stringify({ id: event.id, pubkey: event.pubkey, kind: event.kind, tags: event.tags, statDiffs }));
  }

  if (pubkeyDiffs.length) queries.push(authorStatsQuery(pubkeyDiffs));
  if (eventDiffs.length) queries.push(eventStatsQuery(eventDiffs));

  if (queries.length) {
    await Promise.all(queries.map((query) => query.execute()));
  }
}

/** Calculate stats changes ahead of time so we can build an efficient query. */
async function getStatsDiff(event: NostrEvent, prev: NostrEvent | undefined): Promise<StatDiff[]> {
  const statDiffs: StatDiff[] = [];

  const firstTaggedId = event.tags.find(([name]) => name === 'e')?.[1];
  const inReplyToId = findReplyTag(event.tags)?.[1];

  switch (event.kind) {
    case 1:
      statDiffs.push(['author_stats', event.pubkey, 'notes_count', 1]);
      if (inReplyToId) {
        statDiffs.push(['event_stats', inReplyToId, 'replies_count', 1]);
      }
      break;
    case 3:
      statDiffs.push(...getFollowDiff(event, prev));
      break;
    case 5: {
      if (!firstTaggedId) break;

      const [repostedEvent] = await eventsDB.query(
        [{ kinds: [6], ids: [firstTaggedId], authors: [event.pubkey] }],
        { limit: 1 },
      );
      // Check if the event being deleted is of kind 6,
      // if it is then proceed, else just break
      if (!repostedEvent) break;

      const eventBeingRepostedId = repostedEvent.tags.find(([name]) => name === 'e')?.[1];
      const eventBeingRepostedPubkey = repostedEvent.tags.find(([name]) => name === 'p')?.[1];
      if (!eventBeingRepostedId || !eventBeingRepostedPubkey) break;

      const [eventBeingReposted] = await eventsDB.query(
        [{ kinds: [1], ids: [eventBeingRepostedId], authors: [eventBeingRepostedPubkey] }],
        { limit: 1 },
      );
      if (!eventBeingReposted) break;

      statDiffs.push(['event_stats', eventBeingRepostedId, 'reposts_count', -1]);
      break;
    }
    case 6:
      if (firstTaggedId) {
        statDiffs.push(['event_stats', firstTaggedId, 'reposts_count', 1]);
      }
      break;
    case 7:
      if (firstTaggedId) {
        statDiffs.push(['event_stats', firstTaggedId, 'reactions_count', 1]);
      }
  }

  return statDiffs;
}

/** Create an author stats query from the list of diffs. */
function authorStatsQuery(diffs: AuthorStatDiff[]) {
  const values: AuthorStatsRow[] = diffs.map(([_, pubkey, stat, diff]) => {
    const row: AuthorStatsRow = {
      pubkey,
      followers_count: 0,
      following_count: 0,
      notes_count: 0,
    };
    row[stat] = diff;
    return row;
  });

  return db.insertInto('author_stats')
    .values(values)
    .onConflict((oc) =>
      oc
        .column('pubkey')
        .doUpdateSet((eb) => ({
          followers_count: eb('followers_count', '+', eb.ref('excluded.followers_count')),
          following_count: eb('following_count', '+', eb.ref('excluded.following_count')),
          notes_count: eb('notes_count', '+', eb.ref('excluded.notes_count')),
        }))
    );
}

/** Create an event stats query from the list of diffs. */
function eventStatsQuery(diffs: EventStatDiff[]) {
  const values: EventStatsRow[] = diffs.map(([_, event_id, stat, diff]) => {
    const row: EventStatsRow = {
      event_id,
      replies_count: 0,
      reposts_count: 0,
      reactions_count: 0,
    };
    row[stat] = diff;
    return row;
  });

  return db.insertInto('event_stats')
    .values(values)
    .onConflict((oc) =>
      oc
        .column('event_id')
        .doUpdateSet((eb) => ({
          replies_count: eb('replies_count', '+', eb.ref('excluded.replies_count')),
          reposts_count: eb('reposts_count', '+', eb.ref('excluded.reposts_count')),
          reactions_count: eb('reactions_count', '+', eb.ref('excluded.reactions_count')),
        }))
    );
}

/** Get the last version of the event, if any. */
async function maybeGetPrev(event: NostrEvent): Promise<NostrEvent> {
  const [prev] = await eventsDB.query([
    { kinds: [event.kind], authors: [event.pubkey], limit: 1 },
  ]);

  return prev;
}

/** Set the following count to the total number of unique "p" tags in the follow list. */
function updateFollowingCountQuery({ pubkey, tags }: NostrEvent) {
  const following_count = new Set(
    tags
      .filter(([name]) => name === 'p')
      .map(([_, value]) => value),
  ).size;

  return db.insertInto('author_stats')
    .values({
      pubkey,
      following_count,
      followers_count: 0,
      notes_count: 0,
    })
    .onConflict((oc) =>
      oc
        .column('pubkey')
        .doUpdateSet({ following_count })
    );
}

/** Compare the old and new follow events (if any), and return a diff array. */
function getFollowDiff(event: NostrEvent, prev?: NostrEvent): AuthorStatDiff[] {
  const prevTags = prev?.tags ?? [];

  const prevPubkeys = new Set(
    prevTags
      .filter(([name]) => name === 'p')
      .map(([_, value]) => value),
  );

  const pubkeys = new Set(
    event.tags
      .filter(([name]) => name === 'p')
      .map(([_, value]) => value),
  );

  const added = [...pubkeys].filter((pubkey) => !prevPubkeys.has(pubkey));
  const removed = [...prevPubkeys].filter((pubkey) => !pubkeys.has(pubkey));

  return [
    ...added.map((pubkey): AuthorStatDiff => ['author_stats', pubkey, 'followers_count', 1]),
    ...removed.map((pubkey): AuthorStatDiff => ['author_stats', pubkey, 'followers_count', -1]),
  ];
}

export { updateStats };

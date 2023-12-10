import { type AuthorStatsRow, db, type EventStatsRow } from '@/db.ts';
import { Event, findReplyTag } from '@/deps.ts';

type AuthorStat = keyof Omit<AuthorStatsRow, 'pubkey'>;
type EventStat = keyof Omit<EventStatsRow, 'event_id'>;

type AuthorStatDiff = ['author_stats', pubkey: string, stat: AuthorStat, diff: number];
type EventStatDiff = ['event_stats', eventId: string, stat: EventStat, diff: number];
type StatDiff = AuthorStatDiff | EventStatDiff;

/** Store stats for the event in LMDB. */
async function updateStats(event: Event) {
  const statDiffs = getStatsDiff(event);
  if (!statDiffs.length) return;

  const pubkeyDiffs = statDiffs.filter(([table]) => table === 'author_stats') as AuthorStatDiff[];
  const eventDiffs = statDiffs.filter(([table]) => table === 'event_stats') as EventStatDiff[];

  await Promise.all([
    pubkeyDiffs.length ? authorStatsQuery(pubkeyDiffs).execute() : undefined,
    eventDiffs.length ? eventStatsQuery(eventDiffs).execute() : undefined,
  ]);
}

/** Calculate stats changes ahead of time so we can build an efficient query. */
function getStatsDiff(event: Event): StatDiff[] {
  const statDiffs: StatDiff[] = [];

  const firstE = event.tags.find(([name]) => name === 'e')?.[1];
  const inReplyToId = findReplyTag(event as Event<1>)?.[1];

  switch (event.kind) {
    case 1:
      statDiffs.push(['author_stats', event.pubkey, 'notes_count', 1]);
      if (inReplyToId) {
        statDiffs.push(['event_stats', inReplyToId, 'replies_count', 1]);
      }
      break;
    case 6:
      if (firstE) {
        statDiffs.push(['event_stats', firstE, 'reposts_count', 1]);
      }
      break;
    case 7:
      if (firstE) {
        statDiffs.push(['event_stats', firstE, 'reactions_count', 1]);
      }
  }

  return statDiffs;
}

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

export { updateStats };

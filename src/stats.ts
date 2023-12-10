import { db, type EventStatsRow, type PubkeyStatsRow } from '@/db.ts';
import { Event, findReplyTag } from '@/deps.ts';

type PubkeyStat = keyof Omit<PubkeyStatsRow, 'pubkey'>;
type EventStat = keyof Omit<EventStatsRow, 'event_id'>;

type PubkeyStatDiff = ['pubkey_stats', pubkey: string, stat: PubkeyStat, diff: number];
type EventStatDiff = ['event_stats', eventId: string, stat: EventStat, diff: number];
type StatDiff = PubkeyStatDiff | EventStatDiff;

/** Store stats for the event in LMDB. */
function updateStats(event: Event) {
  const statDiffs = getStatsDiff(event);
  if (!statDiffs.length) return;

  const pubkeyDiffs = statDiffs.filter(([table]) => table === 'pubkey_stats') as PubkeyStatDiff[];
  const eventDiffs = statDiffs.filter(([table]) => table === 'event_stats') as EventStatDiff[];

  return db.transaction().execute(() => {
    return Promise.all([
      pubkeyStatsQuery(pubkeyDiffs).execute(),
      eventStatsQuery(eventDiffs).execute(),
    ]);
  });
}

/** Calculate stats changes ahead of time so we can build an efficient query. */
function getStatsDiff(event: Event): StatDiff[] {
  const statDiffs: StatDiff[] = [];

  const firstE = event.tags.find(([name]) => name === 'e')?.[1];
  const replyTag = findReplyTag(event as Event<1>);

  switch (event.kind) {
    case 1:
      statDiffs.push(['pubkey_stats', event.pubkey, 'notes_count', 1]);
      if (replyTag && replyTag[1]) {
        statDiffs.push(['event_stats', replyTag[1], 'replies_count', 1]);
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

function pubkeyStatsQuery(diffs: PubkeyStatDiff[]) {
  const values: PubkeyStatsRow[] = diffs.map(([_, pubkey, stat, diff]) => {
    const row: PubkeyStatsRow = {
      pubkey,
      followers_count: 0,
      following_count: 0,
      notes_count: 0,
    };
    row[stat] = diff;
    return row;
  });

  return db.insertInto('pubkey_stats')
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

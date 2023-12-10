import { db, type EventStatsRow, type PubkeyStatsRow } from '@/db.ts';
import { Event } from '@/deps.ts';

type PubkeyStat = keyof Omit<PubkeyStatsRow, 'pubkey'>;
type EventStat = keyof Omit<EventStatsRow, 'event_id'>;

/** Store stats for the event in LMDB. */
function updateStats(event: Event) {
  return updateStatsQuery(event)?.execute();
}

function updateStatsQuery(event: Event) {
  const firstE = findFirstTag(event, 'e');

  switch (event.kind) {
    case 1:
      return incrementPubkeyStatsQuery([event.pubkey], 'notes_count', 1);
    case 6:
      return firstE ? incrementEventStatsQuery([firstE], 'reposts_count', 1) : undefined;
    case 7:
      return firstE ? incrementEventStatsQuery([firstE], 'reactions_count', 1) : undefined;
  }
}

function incrementPubkeyStatsQuery(pubkeys: string[], stat: PubkeyStat, diff: number) {
  const values: PubkeyStatsRow[] = pubkeys.map((pubkey) => {
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
          [stat]: eb(stat, '+', diff),
        }))
    );
}

function incrementEventStatsQuery(eventIds: string[], stat: EventStat, diff: number) {
  const values: EventStatsRow[] = eventIds.map((event_id) => {
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
          [stat]: eb(stat, '+', diff),
        }))
    );
}

function findFirstTag({ tags }: Event, name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export { updateStats };

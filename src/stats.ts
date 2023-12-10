import { db, type PubkeyStatsRow } from '@/db.ts';
import { Event } from '@/deps.ts';

type PubkeyStat = keyof Omit<PubkeyStatsRow, 'pubkey'>;

/** Store stats for the event in LMDB. */
function updateStats(event: Event) {
  return updateStatsQuery(event).execute();
}

async function updateStatsQuery(event: Event) {
  switch (event.kind) {
    case 1:
      return incrementPubkeyStatQuery(event.pubkey, 'notes_count', 1);
    case 6:
      return await incrementMentionedEvent(event, 'reposts');
    case 7:
      return await incrementMentionedEvent(event, 'reactions');
  }
}

function incrementPubkeyStatQuery(pubkey: string, stat: PubkeyStat, diff: number) {
  const row: PubkeyStatsRow = {
    pubkey,
    followers_count: 0,
    following_count: 0,
    notes_count: 0,
  };

  row[stat] = diff;

  return db.insertInto('pubkey_stats')
    .values(row)
    .onConflict((oc) =>
      oc
        .column('pubkey')
        .doUpdateSet((eb) => ({
          [stat]: eb(stat, '+', diff),
        }))
    );
}

function findFirstTag({ tags }: Event, name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export { updateStats };

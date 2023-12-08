import { open as lmdb } from 'npm:lmdb';
import { Event } from '@/deps.ts';

const db = lmdb({ path: 'data/ditto.lmdb' });

/** Store stats for the event in LMDB. */
async function saveStats(event: Event): Promise<void> {
  switch (event.kind) {
    case 6:
      return await incrementMentionedEvent(event, 'reposts');
    case 7:
      return await incrementMentionedEvent(event, 'reactions');
  }
}

/** Increment the subkey for the first mentioned event. */
async function incrementMentionedEvent(event: Event, subkey: string): Promise<void> {
  const eventId = event.tags.find(([name]) => name === 'e')?.[1];
  if (eventId) {
    return await incrementKey([eventId, subkey]);
  }
}

/** Increase the counter by 1, or set the key if it doesn't exist. */
function incrementKey(key: string[]): Promise<void> {
  return db.transaction(() => {
    const value = db.get(key) || 0;
    db.put(key, value + 1);
  });
}

export { saveStats };

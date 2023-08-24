import * as eventsDB from '@/db/events.ts';
import { addRelays } from '@/db/relays.ts';
import { findUser } from '@/db/users.ts';
import { type Event } from '@/deps.ts';
import { isLocallyFollowed } from '@/queries.ts';
import { Sub } from '@/subs.ts';
import { trends } from '@/trends.ts';
import { isRelay, nostrDate, nostrNow, Time } from '@/utils.ts';

import type { EventData } from '@/types.ts';

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: Event): Promise<void> {
  const data = await getEventData(event);

  await Promise.all([
    storeEvent(event, data),
    trackRelays(event),
    trackHashtags(event),
    streamOut(event, data),
  ]);
}

/** Preload data that will be useful to several tasks. */
async function getEventData({ pubkey }: Event): Promise<EventData> {
  const user = await findUser({ pubkey });
  return { user };
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: Event, data: EventData): Promise<void> {
  if (data.user || await isLocallyFollowed(event.pubkey)) {
    await eventsDB.insertEvent(event).catch(console.warn);
  } else {
    return Promise.reject(new RelayError('blocked', 'only registered users can post'));
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
// deno-lint-ignore require-await
async function trackHashtags(event: Event): Promise<void> {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1])
    .slice(0, 5);

  if (!tags.length) return;

  try {
    console.info('tracking tags:', tags);
    trends.addTagUsages(event.pubkey, tags, date);
  } catch (_e) {
    // do nothing
  }
}

/** Tracks known relays in the database. */
function trackRelays(event: Event) {
  const relays = new Set<`wss://${string}`>();

  event.tags.forEach((tag) => {
    if (['p', 'e', 'a'].includes(tag[0]) && isRelay(tag[2])) {
      relays.add(tag[2]);
    }
    if (event.kind === 10002 && tag[0] === 'r' && isRelay(tag[1])) {
      relays.add(tag[1]);
    }
  });

  return addRelays([...relays]);
}

/** Determine if the event is being received in a timely manner. */
const isFresh = ({ created_at }: Event): boolean => created_at >= nostrNow() - Time.seconds(10);

/** Distribute the event through active subscriptions. */
function streamOut(event: Event, data: EventData) {
  if (!isFresh(event)) return;

  for (const { socket, id } of Sub.matches(event, data)) {
    socket.send(JSON.stringify(['EVENT', id, event]));
  }
}

/** NIP-20 command line result. */
class RelayError extends Error {
  constructor(prefix: 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid' | 'error', message: string) {
    super(`${prefix}: ${message}`);
  }
}

export { handleEvent, RelayError };

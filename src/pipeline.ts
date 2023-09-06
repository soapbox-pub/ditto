import { Conf } from '@/config.ts';
import * as eventsDB from '@/db/events.ts';
import { addRelays } from '@/db/relays.ts';
import { findUser } from '@/db/users.ts';
import { type Event, LRUCache } from '@/deps.ts';
import { publish } from '@/firehose.ts';
import { isEphemeralKind } from '@/kinds.ts';
import * as mixer from '@/mixer.ts';
import { isLocallyFollowed } from '@/queries.ts';
import { Sub } from '@/subs.ts';
import { getTagSet } from '@/tags.ts';
import { trends } from '@/trends.ts';
import { eventAge, isRelay, nostrDate, Time } from '@/utils.ts';

import type { EventData } from '@/types.ts';

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: Event): Promise<void> {
  if (encounterEvent(event)) return;
  const data = await getEventData(event);

  await Promise.all([
    storeEvent(event, data),
    processDeletions(event),
    trackRelays(event),
    trackHashtags(event),
    streamOut(event, data),
    broadcast(event, data),
  ]);
}

/** Tracks encountered events to skip duplicates, improving idempotency and performance. */
const encounters = new LRUCache<string, boolean>({ max: 1000 });

/** Encounter the event, and return whether it has already been encountered. */
function encounterEvent(event: Event) {
  const result = encounters.get(event.id);
  encounters.set(event.id, true);
  return result;
}

/** Preload data that will be useful to several tasks. */
async function getEventData({ pubkey }: Event): Promise<EventData> {
  const user = await findUser({ pubkey });
  return { user };
}

/** Check if the pubkey is the `DITTO_NSEC` pubkey. */
const isAdminEvent = ({ pubkey }: Event): boolean => pubkey === Conf.pubkey;

/** Maybe store the event, if eligible. */
async function storeEvent(event: Event, data: EventData): Promise<void> {
  if (isEphemeralKind(event.kind)) return;

  if (data.user || isAdminEvent(event) || await isLocallyFollowed(event.pubkey)) {
    const [deletion] = await mixer.getFilters(
      [{ kinds: [5], authors: [event.pubkey], '#e': [event.id], limit: 1 }],
      { limit: 1, timeout: Time.seconds(1) },
    );

    if (deletion) {
      return Promise.reject(new RelayError('blocked', 'event was deleted'));
    } else {
      await eventsDB.insertEvent(event).catch(console.warn);
    }
  } else {
    return Promise.reject(new RelayError('blocked', 'only registered users can post'));
  }
}

/** Query to-be-deleted events, ensure their pubkey matches, then delete them from the database. */
async function processDeletions(event: Event): Promise<void> {
  if (event.kind === 5) {
    const ids = getTagSet(event.tags, 'e');
    const events = await eventsDB.getFilters([{ ids: [...ids] }]);

    const deleteIds = events
      .filter(({ pubkey, id }) => pubkey === event.pubkey && ids.has(id))
      .map((event) => event.id);

    await eventsDB.deleteFilters([{ ids: deleteIds }]);
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
function trackHashtags(event: Event): void {
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
const isFresh = (event: Event): boolean => eventAge(event) < Time.seconds(10);

/** Distribute the event through active subscriptions. */
function streamOut(event: Event, data: EventData) {
  if (!isFresh(event)) return;

  for (const sub of Sub.matches(event, data)) {
    sub.stream(event);
  }
}

/**
 * Publish the event to other relays.
 * This should only be done in certain circumstances, like mentioning a user or publishing deletions.
 */
function broadcast(event: Event, data: EventData) {
  if (!data.user || !isFresh(event)) return;

  if (event.kind === 5) {
    publish(event);
  }
}

/** NIP-20 command line result. */
class RelayError extends Error {
  constructor(prefix: 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid' | 'error', message: string) {
    super(`${prefix}: ${message}`);
  }
}

export { handleEvent, RelayError };

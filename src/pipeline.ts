import { Conf } from '@/config.ts';
import { eventsDB } from '@/db/events.ts';
import { memorelay } from '@/db/memorelay.ts';
import { addRelays } from '@/db/relays.ts';
import { deleteAttachedMedia } from '@/db/unattached-media.ts';
import { findUser } from '@/db/users.ts';
import { Debug, type Event } from '@/deps.ts';
import { isEphemeralKind } from '@/kinds.ts';
import { publish } from '@/pool.ts';
import { isLocallyFollowed } from '@/queries.ts';
import { reqmeister } from '@/reqmeister.ts';
import { updateStats } from '@/stats.ts';
import { Sub } from '@/subs.ts';
import { getTagSet } from '@/tags.ts';
import { type EventData } from '@/types.ts';
import { eventAge, isRelay, nostrDate, Time } from '@/utils.ts';
import { TrendsWorker } from '@/workers/trends.ts';
import { verifySignatureWorker } from '@/workers/verify.ts';

const debug = Debug('ditto:pipeline');

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: Event): Promise<void> {
  if (!(await verifySignatureWorker(event))) return;
  const wanted = reqmeister.isWanted(event);
  if (encounterEvent(event)) return;
  debug(`Event<${event.kind}> ${event.id}`);
  const data = await getEventData(event);

  await Promise.all([
    storeEvent(event, data, { force: wanted }),
    processDeletions(event),
    trackRelays(event),
    trackHashtags(event),
    fetchRelatedEvents(event, data),
    processMedia(event, data),
    streamOut(event, data),
    broadcast(event, data),
  ]);
}

/** Encounter the event, and return whether it has already been encountered. */
function encounterEvent(event: Event): boolean {
  const preexisting = memorelay.hasEvent(event);
  memorelay.insertEvent(event);
  reqmeister.encounter(event);
  return preexisting;
}

/** Preload data that will be useful to several tasks. */
async function getEventData({ pubkey }: Event): Promise<EventData> {
  const user = await findUser({ pubkey });
  return { user };
}

/** Check if the pubkey is the `DITTO_NSEC` pubkey. */
const isAdminEvent = ({ pubkey }: Event): boolean => pubkey === Conf.pubkey;

interface StoreEventOpts {
  force?: boolean;
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: Event, data: EventData, opts: StoreEventOpts = {}): Promise<void> {
  if (isEphemeralKind(event.kind)) return;
  const { force = false } = opts;

  if (force || data.user || isAdminEvent(event) || await isLocallyFollowed(event.pubkey)) {
    const [deletion] = await eventsDB.getEvents(
      [{ kinds: [5], authors: [event.pubkey], '#e': [event.id], limit: 1 }],
      { limit: 1, signal: AbortSignal.timeout(Time.seconds(1)) },
    );

    if (deletion) {
      return Promise.reject(new RelayError('blocked', 'event was deleted'));
    } else {
      await Promise.all([
        eventsDB.storeEvent(event, data).catch(debug),
        updateStats(event).catch(debug),
      ]);
    }
  } else {
    return Promise.reject(new RelayError('blocked', 'only registered users can post'));
  }
}

/** Query to-be-deleted events, ensure their pubkey matches, then delete them from the database. */
async function processDeletions(event: Event): Promise<void> {
  if (event.kind === 5) {
    const ids = getTagSet(event.tags, 'e');
    const events = await eventsDB.getEvents([{ ids: [...ids] }]);

    const deleteIds = events
      .filter(({ pubkey, id }) => pubkey === event.pubkey && ids.has(id))
      .map((event) => event.id);

    await eventsDB.deleteEvents([{ ids: deleteIds }]);
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
async function trackHashtags(event: Event): Promise<void> {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1])
    .slice(0, 5);

  if (!tags.length) return;

  try {
    debug('tracking tags:', JSON.stringify(tags));
    await TrendsWorker.addTagUsages(event.pubkey, tags, date);
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

/** Queue related events to fetch. */
function fetchRelatedEvents(event: Event, data: EventData) {
  if (!data.user) {
    reqmeister.req({ kinds: [0], authors: [event.pubkey] }).catch(() => {});
  }
  for (const [name, id, relay] of event.tags) {
    if (name === 'e' && !memorelay.hasEventById(id)) {
      reqmeister.req({ ids: [id] }, { relays: [relay] }).catch(() => {});
    }
  }
}

/** Delete unattached media entries that are attached to the event. */
function processMedia({ tags, pubkey }: Event, { user }: EventData) {
  if (user) {
    const urls = getTagSet(tags, 'media');
    return deleteAttachedMedia(pubkey, [...urls]);
  }
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

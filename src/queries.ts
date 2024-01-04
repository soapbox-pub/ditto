import { eventsDB, memorelay } from '@/storages.ts';
import { Debug, type Event, findReplyTag } from '@/deps.ts';
import { type AuthorMicrofilter, type DittoFilter, type IdMicrofilter, type Relation } from '@/filter.ts';
import { reqmeister } from '@/reqmeister.ts';
import { type DittoEvent } from '@/storages/types.ts';
import { getTagSet } from '@/tags.ts';

const debug = Debug('ditto:queries');

interface GetEventOpts<K extends number> {
  /** Signal to abort the request. */
  signal?: AbortSignal;
  /** Event kind. */
  kind?: K;
  /** Relations to include on the event. */
  relations?: Relation[];
}

/** Get a Nostr event by its ID. */
const getEvent = async <K extends number = number>(
  id: string,
  opts: GetEventOpts<K> = {},
): Promise<Event<K> | undefined> => {
  debug(`getEvent: ${id}`);
  const { kind, relations, signal = AbortSignal.timeout(1000) } = opts;
  const microfilter: IdMicrofilter = { ids: [id] };

  const [memoryEvent] = await memorelay.getEvents([microfilter], opts) as DittoEvent<K>[];

  if (memoryEvent && !relations) {
    debug(`getEvent: ${id.slice(0, 8)} found in memory`);
    return memoryEvent;
  }

  const filter: DittoFilter<K> = { ids: [id], relations, limit: 1 };
  if (kind) {
    filter.kinds = [kind];
  }

  const dbEvent = await eventsDB.getEvents([filter], { limit: 1, signal })
    .then(([event]) => event);

  // TODO: make this DRY-er.

  if (dbEvent && !dbEvent.author) {
    const [author] = await memorelay.getEvents([{ kinds: [0], authors: [dbEvent.pubkey] }], opts);
    dbEvent.author = author;
  }

  if (dbEvent) {
    debug(`getEvent: ${id.slice(0, 8)} found in db`);
    return dbEvent;
  }

  if (memoryEvent && !memoryEvent.author) {
    const [author] = await memorelay.getEvents([{ kinds: [0], authors: [memoryEvent.pubkey] }], opts);
    memoryEvent.author = author;
  }

  if (memoryEvent) {
    debug(`getEvent: ${id.slice(0, 8)} found in memory`);
    return memoryEvent;
  }

  const reqEvent = await reqmeister.req(microfilter, opts).catch(() => undefined) as Event<K> | undefined;

  if (reqEvent) {
    debug(`getEvent: ${id.slice(0, 8)} found by reqmeister`);
    return reqEvent;
  }

  debug(`getEvent: ${id.slice(0, 8)} not found`);
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, opts: GetEventOpts<0> = {}): Promise<Event<0> | undefined> => {
  const { relations, signal = AbortSignal.timeout(1000) } = opts;
  const microfilter: AuthorMicrofilter = { kinds: [0], authors: [pubkey] };

  const [memoryEvent] = await memorelay.getEvents([microfilter], opts);

  if (memoryEvent && !relations) {
    return memoryEvent;
  }

  const dbEvent = await eventsDB.getEvents(
    [{ authors: [pubkey], relations, kinds: [0], limit: 1 }],
    { limit: 1, signal },
  ).then(([event]) => event);

  if (dbEvent) return dbEvent;
  if (memoryEvent) return memoryEvent;

  return reqmeister.req(microfilter, opts).catch(() => undefined);
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string, signal?: AbortSignal): Promise<Event<3> | undefined> => {
  const [event] = await eventsDB.getEvents([{ authors: [pubkey], kinds: [3], limit: 1 }], { limit: 1, signal });
  return event;
};

/** Get pubkeys the user follows. */
async function getFollowedPubkeys(pubkey: string, signal?: AbortSignal): Promise<string[]> {
  const event = await getFollows(pubkey, signal);
  if (!event) return [];
  return [...getTagSet(event.tags, 'p')];
}

/** Get pubkeys the user follows, including the user's own pubkey. */
async function getFeedPubkeys(pubkey: string): Promise<string[]> {
  const authors = await getFollowedPubkeys(pubkey);
  return [...authors, pubkey];
}

async function getAncestors(event: Event<1>, result = [] as Event<1>[]): Promise<Event<1>[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const parentEvent = await getEvent(inReplyTo, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(parentEvent, result);
      }
    }
  }

  return result.reverse();
}

function getDescendants(eventId: string, signal = AbortSignal.timeout(2000)): Promise<Event<1>[]> {
  return eventsDB.getEvents(
    [{ kinds: [1], '#e': [eventId], relations: ['author', 'event_stats', 'author_stats'] }],
    { limit: 200, signal },
  );
}

/** Returns whether the pubkey is followed by a local user. */
async function isLocallyFollowed(pubkey: string): Promise<boolean> {
  const [event] = await eventsDB.getEvents([{ kinds: [3], '#p': [pubkey], local: true, limit: 1 }], { limit: 1 });
  return Boolean(event);
}

export {
  getAncestors,
  getAuthor,
  getDescendants,
  getEvent,
  getFeedPubkeys,
  getFollowedPubkeys,
  getFollows,
  isLocallyFollowed,
};

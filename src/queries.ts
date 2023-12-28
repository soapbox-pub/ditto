import * as eventsDB from '@/db/events.ts';
import { type Event, findReplyTag } from '@/deps.ts';
import { type AuthorMicrofilter, type DittoFilter, type IdMicrofilter, type Relation } from '@/filter.ts';
import * as mixer from '@/mixer.ts';
import { reqmeister } from '@/reqmeister.ts';
import { memorelay } from '@/db/memorelay.ts';

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
  const { kind, relations, signal = AbortSignal.timeout(1000) } = opts;
  const microfilter: IdMicrofilter = { ids: [id] };

  const [memoryEvent] = await memorelay.getFilters([microfilter], opts) as Event<K>[];

  if (memoryEvent && !relations) {
    return memoryEvent;
  }

  const filter: DittoFilter<K> = { ids: [id], relations, limit: 1 };
  if (kind) {
    filter.kinds = [kind];
  }

  const dbEvent = await eventsDB.getFilters([filter], { limit: 1, signal })
    .then(([event]) => event);

  if (dbEvent) return dbEvent;
  if (memoryEvent) return memoryEvent;

  return await reqmeister.req(microfilter).catch(() => undefined) as Event<K> | undefined;
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, opts: GetEventOpts<0> = {}): Promise<Event<0> | undefined> => {
  const { relations, signal = AbortSignal.timeout(1000) } = opts;
  const microfilter: AuthorMicrofilter = { kinds: [0], authors: [pubkey] };

  const [memoryEvent] = await memorelay.getFilters([microfilter], opts);

  if (memoryEvent && !relations) {
    return memoryEvent;
  }

  const dbEvent = await eventsDB.getFilters(
    [{ authors: [pubkey], relations, kinds: [0], limit: 1 }],
    { limit: 1, signal },
  ).then(([event]) => event);

  if (dbEvent) return dbEvent;
  if (memoryEvent) return memoryEvent;

  return reqmeister.req(microfilter).catch(() => undefined);
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string, signal = AbortSignal.timeout(1000)): Promise<Event<3> | undefined> => {
  const [event] = await mixer.getFilters([{ authors: [pubkey], kinds: [3], limit: 1 }], { limit: 1, signal });
  return event;
};

/** Get pubkeys the user follows. */
async function getFollowedPubkeys(pubkey: string, signal?: AbortSignal): Promise<string[]> {
  const event = await getFollows(pubkey, signal);
  if (!event) return [];

  return event.tags
    .filter((tag) => tag[0] === 'p')
    .map((tag) => tag[1]);
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
  return mixer.getFilters(
    [{ kinds: [1], '#e': [eventId], relations: ['author', 'event_stats', 'author_stats'] }],
    { limit: 200, signal },
  );
}

/** Returns whether the pubkey is followed by a local user. */
async function isLocallyFollowed(pubkey: string): Promise<boolean> {
  const [event] = await eventsDB.getFilters([{ kinds: [3], '#p': [pubkey], local: true, limit: 1 }], { limit: 1 });
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

import { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { Conf } from '@/config.ts';
import { eventsDB, optimizer } from '@/storages.ts';
import { Debug } from '@/deps.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoRelation } from '@/interfaces/DittoFilter.ts';
import { findReplyTag, getTagSet } from '@/tags.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';

const debug = Debug('ditto:queries');

interface GetEventOpts {
  /** Signal to abort the request. */
  signal?: AbortSignal;
  /** Event kind. */
  kind?: number;
  /** Relations to include on the event. */
  relations?: DittoRelation[];
}

/** Get a Nostr event by its ID. */
const getEvent = async (
  id: string,
  opts: GetEventOpts = {},
): Promise<DittoEvent | undefined> => {
  debug(`getEvent: ${id}`);
  const { kind, signal = AbortSignal.timeout(1000) } = opts;

  const filter: NostrFilter = { ids: [id], limit: 1 };
  if (kind) {
    filter.kinds = [kind];
  }

  return await optimizer.query([filter], { limit: 1, signal })
    .then((events) => hydrateEvents({ events, storage: optimizer, signal }))
    .then(([event]) => event);
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, opts: GetEventOpts = {}): Promise<NostrEvent | undefined> => {
  const { signal = AbortSignal.timeout(1000) } = opts;

  return await optimizer.query([{ authors: [pubkey], kinds: [0], limit: 1 }], { limit: 1, signal })
    .then((events) => hydrateEvents({ events, storage: optimizer, signal }))
    .then(([event]) => event);
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string, signal?: AbortSignal): Promise<NostrEvent | undefined> => {
  const [event] = await eventsDB.query([{ authors: [pubkey], kinds: [3], limit: 1 }], { limit: 1, signal });
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

async function getAncestors(event: NostrEvent, result: NostrEvent[] = []): Promise<NostrEvent[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event.tags);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const parentEvent = await getEvent(inReplyTo, { kind: 1 });

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(parentEvent, result);
      }
    }
  }

  return result.reverse();
}

async function getDescendants(eventId: string, signal = AbortSignal.timeout(2000)): Promise<NostrEvent[]> {
  const events = await eventsDB.query([{ kinds: [1], '#e': [eventId] }], { limit: 200, signal });
  return hydrateEvents({ events, storage: eventsDB, signal });
}

/** Returns whether the pubkey is followed by a local user. */
async function isLocallyFollowed(pubkey: string): Promise<boolean> {
  const { host } = Conf.url;

  const [event] = await eventsDB.query(
    [{ kinds: [3], '#p': [pubkey], search: `domain:${host}`, limit: 1 }],
    { limit: 1 },
  );

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

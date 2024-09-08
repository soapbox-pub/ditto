import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { type DittoRelation } from '@/interfaces/DittoFilter.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { findReplyTag, getTagSet } from '@/utils/tags.ts';

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
  const store = await Storages.db();
  const { kind, signal = AbortSignal.timeout(1000) } = opts;

  const filter: NostrFilter = { ids: [id], limit: 1 };
  if (kind) {
    filter.kinds = [kind];
  }

  return await store.query([filter], { limit: 1, signal })
    .then((events) => hydrateEvents({ events, store, signal }))
    .then(([event]) => event);
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, opts: GetEventOpts = {}): Promise<NostrEvent | undefined> => {
  const store = await Storages.db();
  const { signal = AbortSignal.timeout(1000) } = opts;

  return await store.query([{ authors: [pubkey], kinds: [0], limit: 1 }], { limit: 1, signal })
    .then((events) => hydrateEvents({ events, store, signal }))
    .then(([event]) => event);
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string, signal?: AbortSignal): Promise<NostrEvent | undefined> => {
  const store = await Storages.db();
  const [event] = await store.query([{ authors: [pubkey], kinds: [3], limit: 1 }], { limit: 1, signal });
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

async function getAncestors(store: NStore, event: NostrEvent, result: NostrEvent[] = []): Promise<NostrEvent[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event.tags);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const [parentEvent] = await store.query([{ ids: [inReplyTo], until: event.created_at, limit: 1 }]);

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(store, parentEvent, result);
      }
    }
  }

  return result.reverse();
}

async function getDescendants(
  store: NStore,
  event: NostrEvent,
  signal = AbortSignal.timeout(2000),
): Promise<NostrEvent[]> {
  return await store
    .query([{ kinds: [1], '#e': [event.id], since: event.created_at, limit: 200 }], { signal })
    .then((events) => events.filter(({ tags }) => findReplyTag(tags)?.[1] === event.id));
}

/** Returns whether the pubkey is followed by a local user. */
async function isLocallyFollowed(pubkey: string): Promise<boolean> {
  const { host } = Conf.url;

  const store = await Storages.db();

  const [event] = await store.query(
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

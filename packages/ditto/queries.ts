import { DittoDB } from '@ditto/db';
import { DittoConf } from '@ditto/conf';
import { NostrEvent, NostrFilter, NStore } from '@nostrify/nostrify';

import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { findReplyTag, getTagSet } from '@/utils/tags.ts';

interface GetEventOpts {
  db: DittoDB;
  conf: DittoConf;
  relay: NStore;
  signal?: AbortSignal;
}

/**
 * Get a Nostr event by its ID.
 * @deprecated Use `relay.query` directly.
 */
async function getEvent(id: string, opts: GetEventOpts): Promise<DittoEvent | undefined> {
  const filter: NostrFilter = { ids: [id], limit: 1 };
  const events = await opts.relay.query([filter], opts);
  const [event] = await hydrateEvents({ ...opts, events });
  return event;
}

/**
 * Get a Nostr `set_medatadata` event for a user's pubkey.
 * @deprecated Use `relay.query` directly.
 */
async function getAuthor(pubkey: string, opts: GetEventOpts): Promise<NostrEvent | undefined> {
  const events = await opts.relay.query([{ authors: [pubkey], kinds: [0], limit: 1 }], opts);
  const [event] = await hydrateEvents({ ...opts, events });
  return event;
}

/** Get users the given pubkey follows. */
const getFollows = async (relay: NStore, pubkey: string, signal?: AbortSignal): Promise<NostrEvent | undefined> => {
  const [event] = await relay.query([{ authors: [pubkey], kinds: [3], limit: 1 }], { signal });
  return event;
};

/** Get pubkeys the user follows. */
async function getFollowedPubkeys(relay: NStore, pubkey: string, signal?: AbortSignal): Promise<Set<string>> {
  const event = await getFollows(relay, pubkey, signal);
  if (!event) return new Set();
  return getTagSet(event.tags, 'p');
}

/** Get pubkeys the user follows, including the user's own pubkey. */
async function getFeedPubkeys(relay: NStore, pubkey: string): Promise<Set<string>> {
  const authors = await getFollowedPubkeys(relay, pubkey);
  return authors.add(pubkey);
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
  signal?: AbortSignal,
): Promise<NostrEvent[]> {
  return await store
    .query([{ kinds: [1], '#e': [event.id], since: event.created_at, limit: 200 }], { signal })
    .then((events) => events.filter(({ tags }) => findReplyTag(tags)?.[1] === event.id));
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeedPubkeys, getFollowedPubkeys, getFollows };

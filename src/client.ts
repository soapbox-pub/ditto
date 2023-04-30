import { Author, type Filter, findReplyTag, matchFilter, RelayPool } from '@/deps.ts';
import { type Event, type SignedEvent } from '@/event.ts';

import { poolRelays } from './config.ts';

import { eventDateComparator, nostrNow } from './utils.ts';

const pool = new RelayPool(poolRelays);

/** Get events from a NIP-01 filter. */
function getFilter(filter: Filter): Promise<SignedEvent[]> {
  return new Promise((resolve) => {
    const results: SignedEvent[] = [];
    pool.subscribe(
      [filter],
      poolRelays,
      (event: SignedEvent | null) => {
        if (event && matchFilter(filter, event)) {
          results.push(event);
        }
      },
      undefined,
      () => resolve(results),
      { unsubscribeOnEose: true },
    );
  });
}

/** Get a Nostr event by its ID. */
const getEvent = async <K extends number = number>(id: string, kind?: K): Promise<SignedEvent<K> | undefined> => {
  const event = await (pool.getEventById(id, poolRelays, 0) as Promise<SignedEvent>);
  if (event) {
    if (event.id !== id) return undefined;
    if (kind && event.kind !== kind) return undefined;
    return event as SignedEvent<K>;
  }
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string): Promise<SignedEvent<0> | undefined> => {
  const author = new Author(pool, poolRelays, pubkey);
  const event: SignedEvent<0> | null = await new Promise((resolve) => author.metaData(resolve, 0));
  return event?.pubkey === pubkey ? event : undefined;
};

/** Get users the given pubkey follows. */
const getFollows = (pubkey: string): Promise<SignedEvent<3> | undefined> => {
  return new Promise((resolve) => {
    pool.subscribe(
      [{ authors: [pubkey], kinds: [3] }],
      poolRelays,
      (event: SignedEvent<3> | null) => {
        resolve(event?.pubkey === pubkey ? event : undefined);
      },
      undefined,
      undefined,
    );
  });
};

interface PaginationParams {
  since?: number;
  until?: number;
  limit?: number;
}

/** Get events from people the user follows. */
function getFeed(event3: Event<3>, params: PaginationParams = {}): Promise<SignedEvent<1>[]> {
  const limit = Math.max(params.limit ?? 20, 40);
  const authors = event3.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]);
  const results: SignedEvent<1>[] = [];
  authors.push(event3.pubkey); // see own events in feed

  return new Promise((resolve) => {
    pool.subscribe(
      [{
        authors,
        kinds: [1],
        since: params.since,
        until: params.until ?? nostrNow(),
        limit,
      }],
      poolRelays,
      (event: SignedEvent<1> | null) => {
        if (event) {
          results.push(event);

          if (results.length >= limit) {
            resolve(results.slice(0, limit).sort(eventDateComparator));
          }
        }
      },
      void 0,
      () => resolve(results.sort(eventDateComparator)),
      { unsubscribeOnEose: true },
    );
  });
}

async function getAncestors(event: Event<1>, result = [] as Event<1>[]): Promise<Event<1>[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const parentEvent = await getEvent(inReplyTo, 1);

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(parentEvent, result);
      }
    }
  }

  return result.reverse();
}

function getDescendants(eventId: string): Promise<SignedEvent<1>[]> {
  return getFilter({ kinds: [1], '#e': [eventId] }) as Promise<SignedEvent<1>[]>;
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeed, getFollows, pool };

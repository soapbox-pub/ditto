import { Author, RelayPool } from '@/deps.ts';
import { type Event, type SignedEvent } from '@/event.ts';

import { poolRelays } from './config.ts';

import { eventDateComparator, nostrNow } from './utils.ts';

const pool = new RelayPool(poolRelays);

/** Get a Nostr event by its ID. */
const getEvent = async (id: string): Promise<SignedEvent | undefined> => {
  const event = await (pool.getEventById(id, poolRelays, 0) as Promise<SignedEvent>);
  return event?.id === id ? event : undefined;
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

export { getAuthor, getEvent, getFeed, getFollows, pool };

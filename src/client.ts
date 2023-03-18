import { Author, RelayPool } from '@/deps.ts';

import { poolRelays } from './config.ts';

import type { Event, SignedEvent } from './event.ts';
import { eventDateComparator } from './utils.ts';

const pool = new RelayPool(poolRelays);

/** Fetch a Nostr event by its ID. */
const fetchEvent = async (id: string): Promise<SignedEvent | null> => {
  const event = await (pool.getEventById(id, poolRelays, 0) as Promise<SignedEvent>);
  return event?.id === id ? event : null;
};

/** Fetch a Nostr `set_medatadata` event for a user's pubkey. */
const fetchUser = async (pubkey: string): Promise<SignedEvent<0> | null> => {
  const author = new Author(pool, poolRelays, pubkey);
  const event: SignedEvent<0> | null = await new Promise((resolve) => author.metaData(resolve, 0));
  return event?.pubkey === pubkey ? event : null;
};

/** Fetch users the given pubkey follows. */
const fetchFollows = (pubkey: string): Promise<SignedEvent<3> | null> => {
  return new Promise((resolve) => {
    pool.subscribe(
      [{ authors: [pubkey], kinds: [3] }],
      poolRelays,
      (event: SignedEvent<3> | null) => {
        resolve(event?.pubkey === pubkey ? event : null);
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

/** Fetch events from people the user follows. */
function fetchFeed(event3: Event<3>, params: PaginationParams = {}): Promise<SignedEvent<1>[]> {
  const limit = params.limit ?? 20;
  const authors = event3.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]);
  const results: SignedEvent<1>[] = [];
  authors.push(event3.pubkey); // see own events in feed

  return new Promise((resolve) => {
    pool.subscribe(
      [{
        authors,
        kinds: [1],
        since: params.since,
        until: params.until,
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

export { fetchEvent, fetchFeed, fetchFollows, fetchUser, pool };

import { Author, RelayPool } from '@/deps.ts';

import { poolRelays } from './config.ts';

import type { Event, SignedEvent } from './event.ts';

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

/** Fetch 20 events from people the user follows. */
function fetchFeed(event3: Event<3>): Promise<SignedEvent<1>[]> {
  const authors = event3.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1]);
  const results: SignedEvent<1>[] = [];

  return new Promise((resolve) => {
    pool.subscribe(
      [{ authors, kinds: [1], limit: 20 }],
      poolRelays,
      (event: SignedEvent<1> | null) => {
        if (event) {
          results.push(event);
        }
      },
      void 0,
      () => resolve(results),
      { unsubscribeOnEose: true },
    );
  });
}

export { fetchEvent, fetchFeed, fetchFollows, fetchUser, pool };

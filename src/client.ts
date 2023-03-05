import { Author, RelayPool } from '@/deps.ts';

import { poolRelays } from './config.ts';

import type { Event } from './event.ts';

const pool = new RelayPool(poolRelays);

/** Fetch a Nostr event by its ID. */
const fetchEvent = async (id: string): Promise<Event | null> => {
  const event = await (pool.getEventById(id, poolRelays, 0) as Promise<Event>);
  return event?.id === id ? event : null;
};

/** Fetch a Nostr `set_medatadata` event for a user's pubkey. */
const fetchUser = async (pubkey: string): Promise<Event<0> | null> => {
  const author = new Author(pool, poolRelays, pubkey);
  const event: Event<0> | null = await new Promise((resolve) => author.metaData(resolve, 0));
  return event?.pubkey === pubkey ? event : null;
};

/** Fetch users the given pubkey follows. */
const fetchFollows = (pubkey: string): Promise<Event<3> | null> => {
  return new Promise((resolve) => {
    pool.subscribe(
      [{ authors: [pubkey], kinds: [3] }],
      poolRelays,
      (event: Event<3> | null) => {
        resolve(event?.pubkey === pubkey ? event : null);
      },
      undefined,
      undefined,
    );
  });
};

export { fetchEvent, fetchFollows, fetchUser };

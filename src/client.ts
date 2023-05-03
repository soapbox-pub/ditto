import { Author, findReplyTag, matchFilter, RelayPool } from '@/deps.ts';
import { type Event, type SignedEvent } from '@/event.ts';

import { poolRelays } from './config.ts';

import { eventDateComparator, nostrNow } from './utils.ts';

const pool = new RelayPool(poolRelays);

type Filter<K extends number = number> = {
  ids?: string[];
  kinds?: K[];
  authors?: string[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string;
  [key: `#${string}`]: string[];
};

interface GetFilterOpts {
  timeout?: number;
}

/** Get events from a NIP-01 filter. */
function getFilter<K extends number>(filter: Filter<K>, opts: GetFilterOpts = {}): Promise<SignedEvent<K>[]> {
  return new Promise((resolve) => {
    let tid: number;
    const results: SignedEvent[] = [];

    const unsub = pool.subscribe(
      [filter],
      poolRelays,
      (event: SignedEvent | null) => {
        if (event && matchFilter(filter, event)) {
          results.push(event);
        }
        if (filter.limit && results.length >= filter.limit) {
          unsub();
          clearTimeout(tid);
          resolve(results as SignedEvent<K>[]);
        }
      },
      undefined,
      () => {
        unsub();
        clearTimeout(tid);
        resolve(results as SignedEvent<K>[]);
      },
    );

    if (typeof opts.timeout === 'number') {
      tid = setTimeout(() => {
        unsub();
        resolve(results as SignedEvent<K>[]);
      }, opts.timeout);
    }
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
const getFollows = async (pubkey: string): Promise<SignedEvent<3> | undefined> => {
  const filter: Filter = { authors: [pubkey], kinds: [3] };
  const [event] = await getFilter(filter, { timeout: 1000 });
  return event as SignedEvent<3> | undefined;
};

interface PaginationParams {
  since?: number;
  until?: number;
  limit?: number;
}

/** Get events from people the user follows. */
async function getFeed(event3: Event<3>, params: PaginationParams = {}): Promise<SignedEvent<1>[]> {
  const limit = Math.max(params.limit ?? 20, 40);

  const authors = event3.tags
    .filter((tag) => tag[0] === 'p')
    .map((tag) => tag[1]);

  authors.push(event3.pubkey); // see own events in feed

  const filter: Filter = {
    authors,
    kinds: [1],
    since: params.since,
    until: params.until ?? nostrNow(),
    limit,
  };

  const results = await getFilter(filter, { timeout: 5000 }) as SignedEvent<1>[];
  return results.sort(eventDateComparator);
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
  return getFilter({ kinds: [1], '#e': [eventId], limit: 200 }, { timeout: 2000 }) as Promise<SignedEvent<1>[]>;
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeed, getFilter, getFollows, pool };

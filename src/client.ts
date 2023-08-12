import { Author, type Filter, findReplyTag, matchFilter, RelayPool, TTLCache } from '@/deps.ts';
import { type Event, type SignedEvent } from '@/event.ts';

import { Conf } from './config.ts';

import { eventDateComparator, type PaginationParams, Time } from './utils.ts';

const db = await Deno.openKv();

type Pool = InstanceType<typeof RelayPool>;

/** HACK: Websockets in Deno are finnicky... get a new pool every 30 minutes. */
const poolCache = new TTLCache<0, Pool>({
  ttl: Time.minutes(30),
  max: 2,
  dispose: (pool) => {
    console.log('Closing pool.');
    pool.close();
  },
});

function getPool(): Pool {
  const cached = poolCache.get(0);
  if (cached !== undefined) return cached;

  console.log('Creating new pool.');
  const pool = new RelayPool(Conf.poolRelays);
  poolCache.set(0, pool);
  return pool;
}

interface GetFilterOpts {
  timeout?: number;
}

/** Get events from a NIP-01 filter. */
function getFilter<K extends number>(filter: Filter<K>, opts: GetFilterOpts = {}): Promise<SignedEvent<K>[]> {
  return new Promise((resolve) => {
    let tid: number;
    const results: SignedEvent[] = [];

    const unsub = getPool().subscribe(
      [filter],
      Conf.poolRelays,
      (event: SignedEvent | null) => {
        if (event && matchFilter(filter, event)) {
          results.push({
            id: event.id,
            kind: event.kind,
            pubkey: event.pubkey,
            content: event.content,
            tags: event.tags,
            created_at: event.created_at,
            sig: event.sig,
          });
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
  const event = await (getPool().getEventById(id, Conf.poolRelays, 0) as Promise<SignedEvent>);
  if (event) {
    if (event.id !== id) return undefined;
    if (kind && event.kind !== kind) return undefined;
    return event as SignedEvent<K>;
  }
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, timeout = 1000): Promise<SignedEvent<0> | undefined> => {
  const author = new Author(getPool(), Conf.poolRelays, pubkey);

  const event: SignedEvent<0> | null = await new Promise((resolve) => {
    setTimeout(resolve, timeout, null);
    return author.metaData(resolve, 0);
  });

  return event?.pubkey === pubkey ? event : undefined;
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string): Promise<SignedEvent<3> | undefined> => {
  const [event] = await getFilter({ authors: [pubkey], kinds: [3] }, { timeout: 5000 });

  // TODO: figure out a better, more generic & flexible way to handle event cache (and timeouts?)
  // Prewarm cache in GET `/api/v1/accounts/verify_credentials`
  if (event) {
    await db.set(['event3', pubkey], event);
    return event;
  } else {
    return (await db.get<SignedEvent<3>>(['event3', pubkey])).value || undefined;
  }
};

/** Get events from people the user follows. */
async function getFeed(event3: Event<3>, params: PaginationParams): Promise<SignedEvent<1>[]> {
  const authors = event3.tags
    .filter((tag) => tag[0] === 'p')
    .map((tag) => tag[1]);

  authors.push(event3.pubkey); // see own events in feed

  const filter: Filter = {
    authors,
    kinds: [1],
    ...params,
  };

  const results = await getFilter(filter, { timeout: 5000 }) as SignedEvent<1>[];
  return results.sort(eventDateComparator);
}

/** Get a feed of all known text notes. */
async function getPublicFeed(params: PaginationParams): Promise<SignedEvent<1>[]> {
  const results = await getFilter({ kinds: [1], ...params }, { timeout: 5000 });
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

/** Publish an event to the Nostr relay. */
function publish(event: SignedEvent, relays = Conf.publishRelays): void {
  console.log('Publishing event', event, relays);
  try {
    getPool().publish(event, relays);
  } catch (e) {
    console.error(e);
  }
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeed, getFilter, getFollows, getPublicFeed, publish };

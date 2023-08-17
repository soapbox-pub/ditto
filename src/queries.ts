import { type Event, type Filter, findReplyTag } from '@/deps.ts';
import { eventDateComparator, type PaginationParams } from '@/utils.ts';

import { getFilters as getFiltersMixer } from './mixer.ts';

/** Get a Nostr event by its ID. */
const getEvent = async <K extends number = number>(id: string, kind?: K): Promise<Event<K> | undefined> => {
  const filter: Filter<K> = { ids: [id], limit: 1 };
  if (kind) filter.kinds = [kind];
  const [event] = await getFiltersMixer([filter], { limit: 1, timeout: 1000 });
  return event;
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, timeout = 1000): Promise<Event<0> | undefined> => {
  const [event] = await getFiltersMixer([{ authors: [pubkey], kinds: [0] }], { timeout });
  return event;
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string): Promise<Event<3> | undefined> => {
  const [event] = await getFiltersMixer([{ authors: [pubkey], kinds: [3] }], { timeout: 5000 });
  return event;
};

/** Get events from people the user follows. */
async function getFeed(pubkey: string, params: PaginationParams): Promise<Event<1>[]> {
  const event3 = await getFollows(pubkey);
  if (!event3) return [];

  const authors = event3.tags
    .filter((tag) => tag[0] === 'p')
    .map((tag) => tag[1]);

  authors.push(event3.pubkey); // see own events in feed

  const filter: Filter = {
    authors,
    kinds: [1],
    ...params,
  };

  const results = await getFiltersMixer([filter], { timeout: 5000 }) as Event<1>[];
  return results.sort(eventDateComparator);
}

/** Get a feed of all known text notes. */
async function getPublicFeed(params: PaginationParams): Promise<Event<1>[]> {
  const results = await getFiltersMixer([{ kinds: [1], ...params }], { timeout: 5000 });
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

function getDescendants(eventId: string): Promise<Event<1>[]> {
  return getFiltersMixer([{ kinds: [1], '#e': [eventId] }], { limit: 200, timeout: 2000 }) as Promise<Event<1>[]>;
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeed, getFollows, getPublicFeed };

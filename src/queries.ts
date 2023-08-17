import { type Event, type Filter, findReplyTag } from '@/deps.ts';
import { type PaginationParams } from '@/utils.ts';

import * as mixer from './mixer.ts';

interface GetEventOpts<K extends number> {
  /** Timeout in milliseconds. */
  timeout?: number;
  /** Event kind. */
  kind?: K;
}

/** Get a Nostr event by its ID. */
const getEvent = async <K extends number = number>(
  id: string,
  opts: GetEventOpts<K> = {},
): Promise<Event<K> | undefined> => {
  const { kind, timeout = 1000 } = opts;
  const filter: Filter<K> = { ids: [id], limit: 1 };
  if (kind) {
    filter.kinds = [kind];
  }
  const [event] = await mixer.getFilters([filter], { limit: 1, timeout });
  return event;
};

/** Get a Nostr `set_medatadata` event for a user's pubkey. */
const getAuthor = async (pubkey: string, timeout = 1000): Promise<Event<0> | undefined> => {
  const [event] = await mixer.getFilters([{ authors: [pubkey], kinds: [0] }], { timeout });
  return event;
};

/** Get users the given pubkey follows. */
const getFollows = async (pubkey: string, timeout = 1000): Promise<Event<3> | undefined> => {
  const [event] = await mixer.getFilters([{ authors: [pubkey], kinds: [3] }], { timeout });
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

  const filter: Filter<1> = {
    authors,
    kinds: [1],
    ...params,
  };

  return mixer.getFilters([filter], { timeout: 5000 });
}

/** Get a feed of all known text notes. */
function getPublicFeed(params: PaginationParams): Promise<Event<1>[]> {
  return mixer.getFilters([{ kinds: [1], ...params }], { timeout: 5000 });
}

async function getAncestors(event: Event<1>, result = [] as Event<1>[]): Promise<Event<1>[]> {
  if (result.length < 100) {
    const replyTag = findReplyTag(event);
    const inReplyTo = replyTag ? replyTag[1] : undefined;

    if (inReplyTo) {
      const parentEvent = await getEvent(inReplyTo, { kind: 1 });

      if (parentEvent) {
        result.push(parentEvent);
        return getAncestors(parentEvent, result);
      }
    }
  }

  return result.reverse();
}

function getDescendants(eventId: string): Promise<Event<1>[]> {
  return mixer.getFilters([{ kinds: [1], '#e': [eventId] }], { limit: 200, timeout: 2000 });
}

export { getAncestors, getAuthor, getDescendants, getEvent, getFeed, getFollows, getPublicFeed };

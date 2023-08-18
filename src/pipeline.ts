import * as eventsDB from '@/db/events.ts';
import { addRelays } from '@/db/relays.ts';
import { findUser } from '@/db/users.ts';
import { type Event } from '@/deps.ts';
import { isLocallyFollowed } from '@/queries.ts';
import { trends } from '@/trends.ts';
import { isRelay, nostrDate } from '@/utils.ts';

/**
 * Common pipeline function to process (and maybe store) events.
 * It is idempotent, so it can be called multiple times for the same event.
 */
async function handleEvent(event: Event): Promise<void> {
  await Promise.all([
    storeEvent(event),
    trackRelays(event),
    trackHashtags(event),
  ]);
}

/** Maybe store the event, if eligible. */
async function storeEvent(event: Event): Promise<void> {
  if (await findUser({ pubkey: event.pubkey }) || await isLocallyFollowed(event.pubkey)) {
    await eventsDB.insertEvent(event).catch(console.warn);
  } else {
    return Promise.reject(new RelayError('blocked', 'only registered users can post'));
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
// deno-lint-ignore require-await
async function trackHashtags(event: Event): Promise<void> {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1])
    .slice(0, 5);

  if (!tags.length) return;

  try {
    console.info('tracking tags:', tags);
    trends.addTagUsages(event.pubkey, tags, date);
  } catch (_e) {
    // do nothing
  }
}

/** Tracks known relays in the database. */
function trackRelays(event: Event) {
  const relays = new Set<`wss://${string}`>();

  event.tags.forEach((tag) => {
    if (['p', 'e', 'a'].includes(tag[0]) && isRelay(tag[2])) {
      relays.add(tag[2]);
    }
    if (event.kind === 10002 && tag[0] === 'r' && isRelay(tag[1])) {
      relays.add(tag[1]);
    }
  });

  return addRelays([...relays]);
}

/** NIP-20 command line result. */
class RelayError extends Error {
  constructor(prefix: 'duplicate' | 'pow' | 'blocked' | 'rate-limited' | 'invalid' | 'error', message: string) {
    super(`${prefix}: ${message}`);
  }
}

export { handleEvent, RelayError };

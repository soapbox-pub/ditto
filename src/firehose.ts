import { insertEvent, isLocallyFollowed } from '@/db/events.ts';
import { addRelays, getActiveRelays } from '@/db/relays.ts';
import { findUser } from '@/db/users.ts';
import { RelayPool } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { isRelay, nostrDate, nostrNow } from '@/utils.ts';

import type { SignedEvent } from '@/event.ts';

const relays = await getActiveRelays();
const pool = new RelayPool(relays);

// This file watches events on all known relays and performs
// side-effects based on them, such as trending hashtag tracking
// and storing events for notifications and the home feed.
pool.subscribe(
  [{ kinds: [0, 1, 3, 5, 6, 7, 10002], since: nostrNow() }],
  relays,
  handleEvent,
  undefined,
  undefined,
);

/** Handle events through the firehose pipeline. */
async function handleEvent(event: SignedEvent): Promise<void> {
  console.info(`firehose: Event<${event.kind}> ${event.id}`);

  trackHashtags(event);
  trackRelays(event);

  if (await findUser({ pubkey: event.pubkey }) || await isLocallyFollowed(event.pubkey)) {
    insertEvent(event).catch(console.warn);
  }
}

/** Track whenever a hashtag is used, for processing trending tags. */
function trackHashtags(event: SignedEvent): void {
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
function trackRelays(event: SignedEvent) {
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

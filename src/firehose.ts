import { getActiveRelays } from '@/db/relays.ts';
import { type Event, RelayPool } from '@/deps.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from './pipeline.ts';

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
function handleEvent(event: Event): Promise<void> {
  console.info(`firehose: Event<${event.kind}> ${event.id}`);

  return pipeline
    .handleEvent(event)
    .catch(() => {});
}

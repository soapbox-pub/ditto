import { getActiveRelays } from '@/db/relays.ts';
import { type Event, RelayPool } from '@/deps.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from './pipeline.ts';

const _relays = await getActiveRelays();
const pool = new RelayPool(_relays);

// This file watches events on all known relays and performs
// side-effects based on them, such as trending hashtag tracking
// and storing events for notifications and the home feed.
pool.subscribe(
  [{ kinds: [0, 1, 3, 5, 6, 7, 10002], limit: 0, since: nostrNow() }],
  _relays,
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

/** Publish an event to the given relays, or the entire pool. */
function publish(event: Event, relays: string[] = _relays) {
  return pool.publish(event, relays);
}

export { publish };

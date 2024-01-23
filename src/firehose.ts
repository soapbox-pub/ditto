import { Debug, type NostrEvent } from '@/deps.ts';
import { activeRelays, pool } from '@/pool.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from './pipeline.ts';

const debug = Debug('ditto:firehose');

// This file watches events on all known relays and performs
// side-effects based on them, such as trending hashtag tracking
// and storing events for notifications and the home feed.
pool.subscribe(
  [{ kinds: [0, 1, 3, 5, 6, 7, 9735, 10002], limit: 0, since: nostrNow() }],
  activeRelays,
  handleEvent,
  undefined,
  undefined,
);

/** Handle events through the firehose pipeline. */
function handleEvent(event: NostrEvent): Promise<void> {
  debug(`NostrEvent<${event.kind}> ${event.id}`);

  return pipeline
    .handleEvent(event, AbortSignal.timeout(5000))
    .catch(() => {});
}

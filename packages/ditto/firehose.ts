import { firehoseEventsCounter } from '@ditto/metrics';
import { Semaphore } from '@core/asyncutil';
import { NRelay, NStore } from '@nostrify/nostrify';
import { logi } from '@soapbox/logi';

import { nostrNow } from '@/utils.ts';

interface FirehoseOpts {
  pool: NRelay;
  relay: NStore;
  concurrency: number;
  kinds: number[];
  timeout?: number;
}

/**
 * This function watches events on all known relays and performs
 * side-effects based on them, such as trending hashtag tracking
 * and storing events for notifications and the home feed.
 */
export async function startFirehose(opts: FirehoseOpts): Promise<void> {
  const { pool, relay, kinds, concurrency, timeout = 5000 } = opts;

  const sem = new Semaphore(concurrency);

  for await (const msg of pool.req([{ kinds, limit: 0, since: nostrNow() }])) {
    if (msg[0] === 'EVENT') {
      const event = msg[2];

      logi({ level: 'debug', ns: 'ditto.event', source: 'firehose', id: event.id, kind: event.kind });
      firehoseEventsCounter.inc({ kind: event.kind });

      sem.lock(async () => {
        try {
          await relay.event(event, { signal: AbortSignal.timeout(timeout) });
        } catch {
          // Ignore
        }
      });
    }
  }
}

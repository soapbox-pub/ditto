import { firehoseEventsCounter } from '@ditto/metrics';
import { Semaphore } from '@core/asyncutil';
import { logi } from '@soapbox/logi';

import { Conf } from '@/config.ts';
import { Storages } from '@/storages.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from '@/pipeline.ts';

const sem = new Semaphore(Conf.firehoseConcurrency);

/**
 * This function watches events on all known relays and performs
 * side-effects based on them, such as trending hashtag tracking
 * and storing events for notifications and the home feed.
 */
export async function startFirehose(): Promise<void> {
  const store = await Storages.client();

  for await (const msg of store.req([{ kinds: Conf.firehoseKinds, limit: 0, since: nostrNow() }])) {
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      logi({ level: 'debug', ns: 'ditto.event', source: 'firehose', id: event.id, kind: event.kind });
      firehoseEventsCounter.inc({ kind: event.kind });

      sem.lock(async () => {
        try {
          await pipeline.handleEvent(event, { source: 'firehose', signal: AbortSignal.timeout(5000) });
        } catch {
          // Ignore
        }
      });
    }
  }
}

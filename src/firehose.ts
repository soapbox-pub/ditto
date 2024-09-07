import { Semaphore } from '@lambdalisue/async';
import { Stickynotes } from '@soapbox/stickynotes';

import { Conf } from '@/config.ts';
import { firehoseEventsCounter } from '@/metrics.ts';
import { Storages } from '@/storages.ts';
import { nostrNow } from '@/utils.ts';

import * as pipeline from '@/pipeline.ts';

const console = new Stickynotes('ditto:firehose');
const sem = new Semaphore(Conf.firehoseConcurrency);

/**
 * This function watches events on all known relays and performs
 * side-effects based on them, such as trending hashtag tracking
 * and storing events for notifications and the home feed.
 */
export async function startFirehose(): Promise<void> {
  const store = await Storages.client();

  for await (const msg of store.req([{ kinds: [0, 1, 3, 5, 6, 7, 9735, 10002], limit: 0, since: nostrNow() }])) {
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      console.debug(`NostrEvent<${event.kind}> ${event.id}`);
      firehoseEventsCounter.inc({ kind: event.kind });

      sem.lock(async () => {
        try {
          await pipeline.handleEvent(event, AbortSignal.timeout(5000));
        } catch (e) {
          console.warn(e);
        }
      });
    }
  }
}

import { Semaphore } from '@lambdalisue/async';

import { pipelineEncounters } from '@/caches/pipelineEncounters.ts';
import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { Storages } from '@/storages.ts';
import { logi } from '@soapbox/logi';

const sem = new Semaphore(1);

export async function startNotify(): Promise<void> {
  const { listen } = await Storages.database();
  const store = await Storages.db();

  listen('nostr_event', (id) => {
    if (pipelineEncounters.has(id)) {
      logi({ level: 'debug', ns: 'ditto.notify', id, skipped: true });
      return;
    }

    logi({ level: 'debug', ns: 'ditto.notify', id, skipped: false });

    sem.lock(async () => {
      try {
        const signal = AbortSignal.timeout(Conf.db.timeouts.default);

        const [event] = await store.query([{ ids: [id], limit: 1 }], { signal });

        if (event) {
          logi({ level: 'debug', ns: 'ditto.event', source: 'notify', id: event.id, kind: event.kind });
          await pipeline.handleEvent(event, { source: 'notify', signal });
        }
      } catch {
        // Ignore
      }
    });
  });
}

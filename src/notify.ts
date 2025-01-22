import { Semaphore } from '@lambdalisue/async';
import { Stickynotes } from '@soapbox/stickynotes';

import { pipelineEncounters } from '@/caches/pipelineEncounters.ts';
import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { Storages } from '@/storages.ts';

const sem = new Semaphore(1);
const console = new Stickynotes('ditto:notify');

export async function startNotify(): Promise<void> {
  const { listen } = await Storages.database();
  const store = await Storages.db();

  listen('nostr_event', (id) => {
    if (pipelineEncounters.has(id)) {
      console.debug(`Skip event ${id} because it was already in the pipeline`);
      return;
    }

    sem.lock(async () => {
      try {
        const signal = AbortSignal.timeout(Conf.db.timeouts.default);

        const [event] = await store.query([{ ids: [id], limit: 1 }], { signal });

        if (event) {
          await pipeline.handleEvent(event, { source: 'notify', signal });
        }
      } catch (e) {
        console.warn(e);
      }
    });
  });
}

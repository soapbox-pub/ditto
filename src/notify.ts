import { Semaphore } from '@lambdalisue/async';

import { Conf } from '@/config.ts';
import * as pipeline from '@/pipeline.ts';
import { Storages } from '@/storages.ts';

const sem = new Semaphore(1);

export async function startNotify(): Promise<void> {
  const { listen } = await Storages.database();
  const store = await Storages.db();

  listen('nostr_event', (payload) => {
    sem.lock(async () => {
      try {
        const id = payload;
        const timeout = Conf.db.timeouts.default;

        const [event] = await store.query([{ ids: [id], limit: 1 }], { signal: AbortSignal.timeout(timeout) });
        if (event) {
          await pipeline.handleEvent(event, AbortSignal.timeout(timeout));
        }
      } catch (e) {
        console.warn(e);
      }
    });
  });
}

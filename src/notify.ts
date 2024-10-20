import { Semaphore } from '@lambdalisue/async';

import * as pipeline from '@/pipeline.ts';
import { Storages } from '@/storages.ts';

const sem = new Semaphore(1);

export async function startNotify(): Promise<void> {
  const { listen } = await Storages.database();

  listen('nostr_event', (payload) => {
    sem.lock(async () => {
      try {
        const event = JSON.parse(payload);
        await pipeline.handleEvent(event, AbortSignal.timeout(5000));
      } catch (e) {
        console.warn(e);
      }
    });
  });
}

import { Comlink, type NostrEvent } from '@/deps.ts';

import type { VerifyWorker } from './verify.worker.ts';

const worker = Comlink.wrap<typeof VerifyWorker>(
  new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module' }),
);

function verifyEventWorker(event: NostrEvent): Promise<boolean> {
  return worker.verifyEvent(event);
}

export { verifyEventWorker };

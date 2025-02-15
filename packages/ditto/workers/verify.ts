import { NostrEvent } from '@nostrify/nostrify';
import * as Comlink from 'comlink';

import type { VerifyWorker } from './verify.worker.ts';

const worker = Comlink.wrap<typeof VerifyWorker>(
  new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module', name: 'verifyEventWorker' }),
);

function verifyEventWorker(event: NostrEvent): Promise<boolean> {
  return worker.verifyEvent(event);
}

export { verifyEventWorker };

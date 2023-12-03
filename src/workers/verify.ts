import { Comlink, type Event } from '@/deps.ts';

import type { VerifyWorker } from './verify.worker.ts';

const worker = Comlink.wrap<typeof VerifyWorker>(
  new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module' }),
);

function verifySignatureWorker<K extends number>(event: Event<K>): Promise<boolean> {
  return worker.verifySignature(event);
}

export { verifySignatureWorker };

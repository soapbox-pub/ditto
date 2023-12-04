import { Comlink, type Event, type VerifiedEvent, verifySignature } from '@/deps.ts';

export const VerifyWorker = {
  verifySignature<K extends number>(event: Event<K>): event is VerifiedEvent<K> {
    return verifySignature(event);
  },
};

Comlink.expose(VerifyWorker);

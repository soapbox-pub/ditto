import { Comlink, type NostrEvent, type VerifiedEvent, verifySignature } from '@/deps.ts';

export const VerifyWorker = {
  verifySignature(event: NostrEvent): event is VerifiedEvent {
    return verifySignature(event);
  },
};

Comlink.expose(VerifyWorker);

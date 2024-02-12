import { Comlink, type NostrEvent, type VerifiedEvent, verifyEvent } from '@/deps.ts';

export const VerifyWorker = {
  verifyEvent(event: NostrEvent): event is VerifiedEvent {
    return verifyEvent(event);
  },
};

Comlink.expose(VerifyWorker);

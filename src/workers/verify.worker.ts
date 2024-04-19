import { NostrEvent } from '@nostrify/nostrify';
import { Comlink, type VerifiedEvent, verifyEvent } from '@/deps.ts';

export const VerifyWorker = {
  verifyEvent(event: NostrEvent): event is VerifiedEvent {
    return verifyEvent(event);
  },
};

Comlink.expose(VerifyWorker);

import { NostrEvent } from '@nostrify/nostrify';
import { VerifiedEvent, verifyEvent } from 'nostr-tools';

import { Comlink } from '@/deps.ts';
import '@/nostr-wasm.ts';

export const VerifyWorker = {
  verifyEvent(event: NostrEvent): event is VerifiedEvent {
    return verifyEvent(event);
  },
};

Comlink.expose(VerifyWorker);

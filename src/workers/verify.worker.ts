import { NostrEvent } from '@nostrify/nostrify';
import * as Comlink from 'comlink';
import { VerifiedEvent, verifyEvent } from 'nostr-tools';

import '@/nostr-wasm.ts';

export const VerifyWorker = {
  verifyEvent(event: NostrEvent): event is VerifiedEvent {
    return verifyEvent(event);
  },
};

Comlink.expose(VerifyWorker);

import { type SignedEvent } from '@/event.ts';

import { pool } from './client.ts';
import { publishRelays } from './config.ts';

/** Publish an event to the Nostr relay. */
function publish(event: SignedEvent, relays = publishRelays): void {
  console.log('Publishing event', event);
  try {
    pool.publish(event, relays);
  } catch (e) {
    console.error(e);
  }
}

export default publish;

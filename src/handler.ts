import { gossipDB } from '@/db.ts';

import { getAuthorRelays } from './gossip.ts';

import type { Event } from './event.ts';

function handleEvent(event: Event): void {
  handleRelays(event);
}

/** Add author relays into the database. */
function handleRelays(event: Event): Promise<boolean[]> {
  const relays = getAuthorRelays(event);
  return Promise.all(
    relays.map((relay) => gossipDB.put(event.pubkey, relay.toString())),
  );
}

export { handleEvent };

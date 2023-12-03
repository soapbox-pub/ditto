import { getActiveRelays } from '@/db/relays.ts';
import { type Event, RelayPool } from '@/deps.ts';

const allRelays = await getActiveRelays();
const pool = new RelayPool(allRelays, { skipVerification: true });

/** Publish an event to the given relays, or the entire pool. */
function publish(event: Event, relays: string[] = allRelays) {
  return pool.publish(event, relays);
}

export { allRelays, pool, publish };

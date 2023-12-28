import { getActiveRelays } from '@/db/relays.ts';
import { Debug, type Event, RelayPool } from '@/deps.ts';

const debug = Debug('ditto:pool');

const activeRelays = await getActiveRelays();

console.log(`pool: connecting to ${activeRelays.length} relays.`);

const pool = new RelayPool(activeRelays, {
  // The pipeline verifies events.
  skipVerification: true,
  // The logging feature overwhelms the CPU and creates too many logs.
  logErrorsAndNotices: false,
});

/** Publish an event to the given relays, or the entire pool. */
function publish(event: Event, relays: string[] = activeRelays) {
  debug('publish', event);
  return pool.publish(event, relays);
}

export { activeRelays, pool, publish };

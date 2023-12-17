import { getActiveRelays } from '@/db/relays.ts';
import { type Event, RelayPoolWorker } from '@/deps.ts';

const activeRelays = await getActiveRelays();

console.log(`pool: connecting to ${activeRelays.length} relays.`);

const worker = new Worker('https://unpkg.com/nostr-relaypool@0.6.30/lib/nostr-relaypool.worker.js', { type: 'module' });

// @ts-ignore Wrong types.
const pool = new RelayPoolWorker(worker, activeRelays, {
  // The pipeline verifies events.
  skipVerification: true,
  // The logging feature overwhelms the CPU and creates too many logs.
  logErrorsAndNotices: false,
});

/** Publish an event to the given relays, or the entire pool. */
function publish(event: Event, relays: string[] = activeRelays) {
  return pool.publish(event, relays);
}

export { activeRelays, pool, publish };

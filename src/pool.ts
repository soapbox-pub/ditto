import { getActiveRelays } from '@/db/relays.ts';
import { RelayPoolWorker } from '@/deps.ts';

const activeRelays = await getActiveRelays();

console.log(`pool: connecting to ${activeRelays.length} relays.`);

const worker = new Worker('https://unpkg.com/nostr-relaypool@0.6.30/lib/nostr-relaypool.worker.js', { type: 'module' });

// @ts-ignore Wrong types.
const pool = new RelayPoolWorker(worker, activeRelays, {
  autoReconnect: true,
  // The pipeline verifies events.
  skipVerification: true,
  // The logging feature overwhelms the CPU and creates too many logs.
  logErrorsAndNotices: false,
});

export { activeRelays, pool };

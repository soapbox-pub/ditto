import { RelayPoolWorker } from 'nostr-relaypool';

import { Storages } from '@/storages.ts';
import { Conf } from '@/config.ts';

const [relayList] = await Storages.db.query([
  { kinds: [10002], authors: [Conf.pubkey], limit: 1 },
]);

const tags = relayList?.tags ?? [];

const activeRelays = tags.reduce((acc, [name, url, marker]) => {
  if (name === 'r' && !marker) {
    acc.push(url);
  }
  return acc;
}, []);

console.log(`pool: connecting to ${activeRelays.length} relays.`);

const worker = new Worker('https://unpkg.com/nostr-relaypool2@0.6.34/lib/nostr-relaypool.worker.js', {
  type: 'module',
});

// @ts-ignore Wrong types.
const pool = new RelayPoolWorker(worker, activeRelays, {
  autoReconnect: true,
  // The pipeline verifies events.
  skipVerification: true,
  // The logging feature overwhelms the CPU and creates too many logs.
  logErrorsAndNotices: false,
});

export { activeRelays, pool };

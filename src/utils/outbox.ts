import { Conf } from '@/config.ts';
import { eventsDB } from '@/storages.ts';

export async function getRelays(pubkey: string): Promise<Set<string>> {
  const relays = new Set<`wss://${string}`>();

  const events = await eventsDB.query([
    { kinds: [10002], authors: [pubkey, Conf.pubkey], limit: 2 },
  ]);

  for (const event of events) {
    for (const [name, relay, marker] of event.tags) {
      if (name === 'r' && (marker === 'write' || !marker)) {
        try {
          const url = new URL(relay);
          if (url.protocol === 'wss:') {
            relays.add(url.toString() as `wss://${string}`);
          }
        } catch (_e) {
          // do nothing
        }
      }
    }
  }

  return relays;
}

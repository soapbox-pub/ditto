import { type AppContext } from '@/app.ts';
import { getEventHash, getPublicKey, getSignature } from '@/deps.ts';

import type { Event, EventTemplate, SignedEvent } from '@/event.ts';

/** Sign Nostr event using the app context. */
// deno-lint-ignore require-await
async function signEvent<K extends number = number>(event: EventTemplate<K>, c: AppContext): Promise<SignedEvent<K>> {
  const seckey = c.get('seckey')!;

  (event as Event<K>).pubkey = getPublicKey(seckey);
  (event as Event<K>).id = getEventHash(event as Event<K>);
  (event as Event<K>).sig = getSignature(event as Event<K>, seckey);

  return event as SignedEvent<K>;
}

export { signEvent };

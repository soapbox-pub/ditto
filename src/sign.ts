import { type AppContext } from '@/app.ts';
import { getEventHash, getPublicKey, getSignature, HTTPException } from '@/deps.ts';
import ws from '@/stream.ts';

import type { Event, EventTemplate, SignedEvent } from '@/event.ts';

/** Get signing WebSocket from app context. */
function getSignStream(c: AppContext): WebSocket | undefined {
  const pubkey = c.get('pubkey');
  const session = c.get('session');

  console.log(`nostr:${pubkey}:${session}`);

  if (pubkey && session) {
    const [socket] = ws.getSockets(`nostr:${pubkey}:${session}`);
    return socket;
  }
}

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - If a signing WebSocket is provided, it will be used to sign the event.
 */
async function signEvent<K extends number = number>(event: EventTemplate<K>, c: AppContext): Promise<SignedEvent<K>> {
  const seckey = c.get('seckey');
  const stream = getSignStream(c);

  if (!seckey && stream) {
    try {
      return await new Promise<SignedEvent<K>>((resolve, reject) => {
        const handleMessage = (e: MessageEvent) => {
          // TODO: parse and validate with zod
          const data = JSON.parse(e.data);
          if (data.event === 'nostr.sign') {
            stream.removeEventListener('message', handleMessage);
            resolve(JSON.parse(data.payload));
          }
        };
        stream.addEventListener('message', handleMessage);
        stream.send(JSON.stringify({ event: 'nostr.sign', payload: JSON.stringify(event) }));
        setTimeout(() => {
          stream.removeEventListener('message', handleMessage);
          reject();
        }, 60000);
      });
    } catch (_e) {
      throw new HTTPException(408, {
        res: c.json({ id: 'ditto.timeout', error: 'Signing timeout' }, 408),
      });
    }
  }

  if (!seckey) {
    throw new HTTPException(400, {
      res: c.json({ id: 'ditto.private_key', error: 'No private key' }, 400),
    });
  }

  (event as Event<K>).pubkey = getPublicKey(seckey);
  (event as Event<K>).id = getEventHash(event as Event<K>);
  (event as Event<K>).sig = getSignature(event as Event<K>, seckey);

  return event as SignedEvent<K>;
}

export { signEvent };

import { type AppContext } from '@/app.ts';
import { getEventHash, getPublicKey, getSignature, HTTPException, z } from '@/deps.ts';
import { signedEventSchema } from '@/schemas/nostr.ts';
import { ws } from '@/stream.ts';

import type { Event, EventTemplate, SignedEvent } from '@/event.ts';

/** Get signing WebSocket from app context. */
function getSignStream(c: AppContext): WebSocket | undefined {
  const pubkey = c.get('pubkey');
  const session = c.get('session');

  if (pubkey && session) {
    const [socket] = ws.getSockets(`nostr:${pubkey}:${session}`);
    return socket;
  }
}

const nostrStreamingEventSchema = z.object({
  type: z.literal('nostr.sign'),
  data: signedEventSchema,
});

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
          try {
            const { data: event } = nostrStreamingEventSchema.parse(JSON.parse(e.data));
            stream.removeEventListener('message', handleMessage);
            resolve(event as SignedEvent<K>);
          } catch (_e) {
            //
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

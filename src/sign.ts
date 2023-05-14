import { type AppContext } from '@/app.ts';
import { getEventHash, getPublicKey, getSignature, HTTPException } from '@/deps.ts';

import type { Event, EventTemplate, SignedEvent } from '@/event.ts';

/** Map of OAuth tokens to WebSocket signing streams. */
export const signStreams = new Map<string, WebSocket>();

/** Get signing WebSocket from app context. */
function getSignStream(c: AppContext): WebSocket | undefined {
  const token = c.req.headers.get('authorization')?.replace(/^Bearer /, '');
  return token ? signStreams.get(token) : undefined;
}

/** Sign Nostr event using the app context. */
async function signEvent<K extends number = number>(event: EventTemplate<K>, c: AppContext): Promise<SignedEvent<K>> {
  const seckey = c.get('seckey');
  const stream = getSignStream(c);

  if (stream) {
    try {
      return await new Promise<SignedEvent<K>>((resolve, reject) => {
        stream.addEventListener('message', (e) => {
          const data = JSON.parse(e.data);
          if (data.event === 'nostr.sign') {
            resolve(JSON.parse(data.payload));
          }
        });
        stream.send(JSON.stringify({ event: 'nostr.sign', payload: JSON.stringify(event) }));
        setTimeout(reject, 30000);
      });
    } catch (_e) {
      throw new HTTPException(504, {
        res: c.json({ id: 'ditto.timeout', error: 'Signing timeout' }, 504),
      });
    }
  }

  // Ditto only supports publishing events with a private key (for now).
  // TODO: Let the client sign events through a websocket.
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

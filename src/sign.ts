import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { decryptAdmin, encryptAdmin } from '@/crypto.ts';
import { type Event, type EventTemplate, finishEvent, HTTPException } from '@/deps.ts';
import { connectResponseSchema } from '@/schemas/nostr.ts';
import { jsonSchema } from '@/schema.ts';
import { Sub } from '@/subs.ts';
import { Time } from '@/utils.ts';
import { createAdminEvent } from '@/utils/web.ts';

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - If `X-Nostr-Sign` is passed, it will use a NIP-46 to sign the event.
 */
async function signEvent<K extends number = number>(event: EventTemplate<K>, c: AppContext): Promise<Event<K>> {
  const seckey = c.get('seckey');
  const header = c.req.headers.get('x-nostr-sign');

  if (seckey) {
    return finishEvent(event, seckey);
  }

  if (header) {
    return await signNostrConnect(event, c);
  }

  throw new HTTPException(400, {
    res: c.json({ id: 'ditto.sign', error: 'Unable to sign event' }, 400),
  });
}

/** Sign event with NIP-46, waiting in the background for the signed event. */
async function signNostrConnect<K extends number = number>(event: EventTemplate<K>, c: AppContext): Promise<Event<K>> {
  const pubkey = c.get('pubkey');

  if (!pubkey) {
    throw new HTTPException(401);
  }

  const messageId = crypto.randomUUID();

  createAdminEvent({
    kind: 24133,
    content: await encryptAdmin(
      pubkey,
      JSON.stringify({
        id: messageId,
        method: 'sign_event',
        params: [event],
      }),
    ),
    tags: [['p', pubkey]],
  }, c);

  return awaitSignedEvent<K>(pubkey, messageId, c);
}

/** Wait for signed event to be sent through Nostr relay. */
async function awaitSignedEvent<K extends number = number>(
  pubkey: string,
  messageId: string,
  c: AppContext,
): Promise<Event<K>> {
  const sub = Sub.sub(messageId, '1', [{ kinds: [24133], authors: [pubkey], '#p': [Conf.pubkey] }]);

  function close(): void {
    Sub.close(messageId);
  }

  const timeout = setTimeout(() => {
    close();
    throw new HTTPException(408, {
      res: c.json({ id: 'ditto.timeout', error: 'Signing timeout' }),
    });
  }, Time.minutes(1));

  for await (const event of sub) {
    if (event.kind === 24133) {
      const decrypted = await decryptAdmin(event.pubkey, event.content);
      const msg = jsonSchema.pipe(connectResponseSchema).parse(decrypted);

      if (msg.id === messageId) {
        close();
        clearTimeout(timeout);
        return msg.result as Event<K>;
      }
    }
  }

  // This should never happen.
  throw new HTTPException(500, {
    res: c.json({ id: 'ditto.sign', error: 'Unable to sign event' }, 500),
  });
}

/** Sign event as the Ditto server. */
// deno-lint-ignore require-await
async function signAdminEvent<K extends number = number>(event: EventTemplate<K>): Promise<Event<K>> {
  return finishEvent(event, Conf.seckey);
}

export { signAdminEvent, signEvent };

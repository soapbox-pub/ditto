import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { decryptAdmin, encryptAdmin } from '@/crypto.ts';
import { type Event, type EventTemplate, finishEvent, HTTPException } from '@/deps.ts';
import { connectResponseSchema } from '@/schemas/nostr.ts';
import { jsonSchema } from '@/schema.ts';
import { Sub } from '@/subs.ts';
import { eventMatchesTemplate, Time } from '@/utils.ts';
import { createAdminEvent } from '@/utils/web.ts';

interface SignEventOpts {
  /** Target proof-of-work difficulty for the signed event. */
  pow?: number;
}

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - If `X-Nostr-Sign` is passed, it will use NIP-46 to sign the event.
 */
async function signEvent<K extends number = number>(
  event: EventTemplate<K>,
  c: AppContext,
  opts: SignEventOpts = {},
): Promise<Event<K>> {
  const seckey = c.get('seckey');
  const header = c.req.headers.get('x-nostr-sign');

  if (seckey) {
    return finishEvent(event, seckey);
  }

  if (header) {
    return await signNostrConnect(event, c, opts);
  }

  throw new HTTPException(400, {
    res: c.json({ id: 'ditto.sign', error: 'Unable to sign event' }, 400),
  });
}

/** Sign event with NIP-46, waiting in the background for the signed event. */
async function signNostrConnect<K extends number = number>(
  event: EventTemplate<K>,
  c: AppContext,
  opts: SignEventOpts = {},
): Promise<Event<K>> {
  const pubkey = c.get('pubkey');

  if (!pubkey) {
    throw new HTTPException(401, { message: 'Missing pubkey' });
  }

  const messageId = crypto.randomUUID();

  createAdminEvent({
    kind: 24133,
    content: await encryptAdmin(
      pubkey,
      JSON.stringify({
        id: messageId,
        method: 'sign_event',
        params: [event, {
          pow: opts.pow,
        }],
      }),
    ),
    tags: [['p', pubkey]],
  }, c);

  return awaitSignedEvent<K>(pubkey, messageId, event, c);
}

/** Wait for signed event to be sent through Nostr relay. */
async function awaitSignedEvent<K extends number = number>(
  pubkey: string,
  messageId: string,
  template: EventTemplate<K>,
  c: AppContext,
): Promise<Event<K>> {
  const sub = Sub.sub(messageId, '1', [{ kinds: [24133], authors: [pubkey], '#p': [Conf.pubkey] }]);

  function close(): void {
    Sub.close(messageId);
  }

  const timeout = setTimeout(close, Time.minutes(1));

  for await (const event of sub) {
    const decrypted = await decryptAdmin(event.pubkey, event.content);

    const result = jsonSchema
      .pipe(connectResponseSchema)
      .refine((msg) => msg.id === messageId, 'Message ID mismatch')
      .refine((msg) => eventMatchesTemplate(msg.result, template), 'Event template mismatch')
      .safeParse(decrypted);

    if (result.success) {
      close();
      clearTimeout(timeout);
      return result.data.result as Event<K>;
    }
  }

  throw new HTTPException(408, {
    res: c.json({ id: 'ditto.timeout', error: 'Signing timeout' }),
  });
}

/** Sign event as the Ditto server. */
// deno-lint-ignore require-await
async function signAdminEvent<K extends number = number>(event: EventTemplate<K>): Promise<Event<K>> {
  return finishEvent(event, Conf.seckey);
}

export { signAdminEvent, signEvent };

import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { decryptAdmin, encryptAdmin } from '@/crypto.ts';
import { HTTPException, type NostrEvent, type NostrSigner, NSecSigner, Stickynotes } from '@/deps.ts';
import { connectResponseSchema } from '@/schemas/nostr.ts';
import { jsonSchema } from '@/schema.ts';
import { Sub } from '@/subs.ts';
import { eventMatchesTemplate } from '@/utils.ts';
import { createAdminEvent } from '@/utils/api.ts';

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - If `X-Nostr-Sign` is passed, it will use NIP-46 to sign the event.
 */
export class APISigner implements NostrSigner {
  #c: AppContext;
  #console = new Stickynotes('ditto:sign');

  constructor(c: AppContext) {
    this.#c = c;
  }

  // deno-lint-ignore require-await
  async getPublicKey(): Promise<string> {
    const pubkey = this.#c.get('pubkey');
    if (pubkey) {
      return pubkey;
    } else {
      throw new HTTPException(401, { message: 'Missing pubkey' });
    }
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const seckey = this.#c.get('seckey');
    const header = this.#c.req.header('x-nostr-sign');

    if (seckey) {
      this.#console.debug(`Signing Event<${event.kind}> with secret key`);
      return new NSecSigner(seckey).signEvent(event);
    }

    if (header) {
      this.#console.debug(`Signing Event<${event.kind}> with NIP-46`);
      return await this.#signNostrConnect(event);
    }

    throw new HTTPException(400, {
      res: this.#c.json({ id: 'ditto.sign', error: 'Unable to sign event' }, 400),
    });
  }

  /** Sign event with NIP-46, waiting in the background for the signed event. */
  async #signNostrConnect(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const pubkey = this.#c.get('pubkey');

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
          params: [event],
        }),
      ),
      tags: [['p', pubkey]],
    }, this.#c);

    return this.#awaitSignedEvent(pubkey, messageId, event);
  }

  /** Wait for signed event to be sent through Nostr relay. */
  async #awaitSignedEvent(
    pubkey: string,
    messageId: string,
    template: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
  ): Promise<NostrEvent> {
    const sub = Sub.sub(messageId, '1', [{ kinds: [24133], authors: [pubkey], '#p': [Conf.pubkey] }]);

    const close = (): void => {
      Sub.close(messageId);
      this.#c.req.raw.signal.removeEventListener('abort', close);
    };

    this.#c.req.raw.signal.addEventListener('abort', close);

    for await (const event of sub) {
      const decrypted = await decryptAdmin(event.pubkey, event.content);

      const result = jsonSchema
        .pipe(connectResponseSchema)
        .refine((msg) => msg.id === messageId, 'Message ID mismatch')
        .refine((msg) => eventMatchesTemplate(msg.result, template), 'Event template mismatch')
        .safeParse(decrypted);

      if (result.success) {
        close();
        return result.data.result;
      }
    }

    throw new HTTPException(408, {
      res: this.#c.json({ id: 'ditto.timeout', error: 'Signing timeout' }),
    });
  }
}

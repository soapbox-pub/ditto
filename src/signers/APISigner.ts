import { NostrEvent, NostrSigner, NSecSigner } from '@nostrify/nostrify';
import { HTTPException } from 'hono';
import { type AppContext } from '@/app.ts';
import { Conf } from '@/config.ts';
import { Stickynotes } from '@/deps.ts';
import { connectResponseSchema } from '@/schemas/nostr.ts';
import { jsonSchema } from '@/schema.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';
import { eventMatchesTemplate } from '@/utils.ts';
import { createAdminEvent } from '@/utils/api.ts';

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - Otherwise, it will use NIP-46 to sign the event.
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

    if (seckey) {
      this.#console.debug(`Signing Event<${event.kind}> with secret key`);
      return new NSecSigner(seckey).signEvent(event);
    }

    this.#console.debug(`Signing Event<${event.kind}> with NIP-46`);
    return await this.#signNostrConnect(event);
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
      content: await new AdminSigner().nip04.encrypt(
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
    const sub = Storages.pubsub.req(
      [{ kinds: [24133], authors: [pubkey], '#p': [Conf.pubkey] }],
      { signal: this.#c.req.raw.signal },
    );

    for await (const msg of sub) {
      if (msg[0] === 'EVENT') {
        const event = msg[2];
        const decrypted = await new AdminSigner().nip04.decrypt(event.pubkey, event.content);

        const result = jsonSchema
          .pipe(connectResponseSchema)
          .refine((msg) => msg.id === messageId, 'Message ID mismatch')
          .refine((msg) => eventMatchesTemplate(msg.result, template), 'Event template mismatch')
          .safeParse(decrypted);

        if (result.success) {
          return result.data.result;
        }
      }
    }

    throw new HTTPException(408, {
      res: this.#c.json({ id: 'ditto.timeout', error: 'Signing timeout' }),
    });
  }
}

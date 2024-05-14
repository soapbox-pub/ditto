// deno-lint-ignore-file require-await

import { NConnectSigner, NostrEvent, NostrSigner, NSecSigner } from '@nostrify/nostrify';
import { HTTPException } from 'hono';

import { type AppContext } from '@/app.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';

/**
 * Sign Nostr event using the app context.
 *
 * - If a secret key is provided, it will be used to sign the event.
 * - Otherwise, it will use NIP-46 to sign the event.
 */
export class APISigner implements NostrSigner {
  private signer: NostrSigner;

  constructor(c: AppContext) {
    const seckey = c.get('seckey');
    const pubkey = c.get('pubkey');

    if (!pubkey) {
      throw new HTTPException(401, { message: 'Missing pubkey' });
    }

    if (seckey) {
      this.signer = new NSecSigner(seckey);
    } else {
      this.signer = new NConnectSigner({
        pubkey,
        relay: Storages.pubsub,
        signer: new AdminSigner(),
        timeout: 60000,
      });
    }
  }

  async getPublicKey(): Promise<string> {
    return this.signer.getPublicKey();
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    return this.signer.signEvent(event);
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this.signer.nip04!.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this.signer.nip04!.decrypt(pubkey, ciphertext);
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      return this.signer.nip44!.encrypt(pubkey, plaintext);
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      return this.signer.nip44!.decrypt(pubkey, ciphertext);
    },
  };
}

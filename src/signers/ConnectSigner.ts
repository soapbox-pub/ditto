// deno-lint-ignore-file require-await
import { HTTPException } from '@hono/hono/http-exception';
import { NConnectSigner, NostrEvent, NostrSigner } from '@nostrify/nostrify';

import { Storages } from '@/storages.ts';

/**
 * NIP-46 signer.
 *
 * Simple extension of nostrify's `NConnectSigner`, with our options to keep it DRY.
 */
export class ConnectSigner implements NostrSigner {
  private signer: Promise<NConnectSigner>;

  constructor(private pubkey: string, signer: NostrSigner, private relays?: string[]) {
    this.signer = this.init(signer);
  }

  async init(signer: NostrSigner): Promise<NConnectSigner> {
    return new NConnectSigner({
      pubkey: this.pubkey,
      // TODO: use a remote relay for `nprofile` signing (if present and `Conf.relay` isn't already in the list)
      relay: await Storages.pubsub(),
      signer,
      timeout: 60_000,
    });
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const signer = await this.signer;
    try {
      return await signer.signEvent(event);
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new HTTPException(408, { message: 'The event was not signed quickly enough' });
      } else {
        throw e;
      }
    }
  }

  readonly nip04 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const signer = await this.signer;
      try {
        return await signer.nip04.encrypt(pubkey, plaintext);
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new HTTPException(408, {
            message: 'Text was not encrypted quickly enough',
          });
        } else {
          throw e;
        }
      }
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      try {
        return await signer.nip04.decrypt(pubkey, ciphertext);
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new HTTPException(408, {
            message: 'Text was not decrypted quickly enough',
          });
        } else {
          throw e;
        }
      }
    },
  };

  readonly nip44 = {
    encrypt: async (pubkey: string, plaintext: string): Promise<string> => {
      const signer = await this.signer;
      try {
        return await signer.nip44.encrypt(pubkey, plaintext);
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new HTTPException(408, {
            message: 'Text was not encrypted quickly enough',
          });
        } else {
          throw e;
        }
      }
    },

    decrypt: async (pubkey: string, ciphertext: string): Promise<string> => {
      const signer = await this.signer;
      try {
        return await signer.nip44.decrypt(pubkey, ciphertext);
      } catch (e) {
        if (e.name === 'AbortError') {
          throw new HTTPException(408, {
            message: 'Text was not decrypted quickly enough',
          });
        } else {
          throw e;
        }
      }
    },
  };

  // Prevent unnecessary NIP-46 round-trips.
  async getPublicKey(): Promise<string> {
    return this.pubkey;
  }

  /** Get the user's relays if they passed in an `nprofile` auth token. */
  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    return this.relays?.reduce<Record<string, { read: boolean; write: boolean }>>((acc, relay) => {
      acc[relay] = { read: true, write: true };
      return acc;
    }, {}) ?? {};
  }
}

// deno-lint-ignore-file require-await
import { HTTPException } from '@hono/hono/http-exception';
import { NConnectSigner, type NostrEvent, type NostrSigner, type NRelay } from '@nostrify/nostrify';

interface ConnectSignerOpts {
  relay: NRelay;
  bunkerPubkey: string;
  userPubkey: string;
  signer: NostrSigner;
  relays?: string[];
}

/**
 * NIP-46 signer.
 *
 * Simple extension of nostrify's `NConnectSigner`, with our options to keep it DRY.
 */
export class ConnectSigner implements NostrSigner {
  private signer: Promise<NConnectSigner>;

  constructor(private opts: ConnectSignerOpts) {
    this.signer = this.init(opts.signer);
  }

  async init(signer: NostrSigner): Promise<NConnectSigner> {
    return new NConnectSigner({
      encryption: 'nip44',
      pubkey: this.opts.bunkerPubkey,
      relay: this.opts.relay,
      signer,
      timeout: 60_000,
    });
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const signer = await this.signer;
    try {
      return await signer.signEvent(event);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
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
        if (e instanceof Error && e.name === 'AbortError') {
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
        if (e instanceof Error && e.name === 'AbortError') {
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
        if (e instanceof Error && e.name === 'AbortError') {
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
        if (e instanceof Error && e.name === 'AbortError') {
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
    return this.opts.userPubkey;
  }

  /** Get the user's relays if they passed in an `nprofile` auth token. */
  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    return this.opts.relays?.reduce<Record<string, { read: boolean; write: boolean }>>((acc, relay) => {
      acc[relay] = { read: true, write: true };
      return acc;
    }, {}) ?? {};
  }
}

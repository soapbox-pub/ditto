// deno-lint-ignore-file require-await
import { HTTPException } from '@hono/hono/http-exception';
import { NConnectSigner, NostrEvent, NostrSigner, NRelay } from '@nostrify/nostrify';

interface ConnectSignerOpts {
  bunkerPubkey: string;
  userPubkey: string;
  signer: NostrSigner;
  relay: NRelay;
  relays?: string[];
}

/**
 * NIP-46 signer.
 *
 * Simple extension of nostrify's `NConnectSigner`, with our options to keep it DRY.
 */
export class ConnectSigner implements NostrSigner {
  private signer: NConnectSigner;

  constructor(private opts: ConnectSignerOpts) {
    const { relay, signer } = this.opts;

    this.signer = new NConnectSigner({
      encryption: 'nip44',
      pubkey: this.opts.bunkerPubkey,
      relay,
      signer,
      timeout: 60_000,
    });
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    try {
      return await this.signer.signEvent(event);
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
      try {
        return await this.signer.nip04.encrypt(pubkey, plaintext);
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
      try {
        return await this.signer.nip04.decrypt(pubkey, ciphertext);
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
      try {
        return await this.signer.nip44.encrypt(pubkey, plaintext);
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
      try {
        return await this.signer.nip44.decrypt(pubkey, ciphertext);
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

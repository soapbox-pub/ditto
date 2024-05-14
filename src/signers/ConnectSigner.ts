// deno-lint-ignore-file require-await
import { NConnectSigner } from '@nostrify/nostrify';

import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';

/**
 * NIP-46 signer.
 *
 * Simple extension of nostrify's `NConnectSigner`, with our options to keep it DRY.
 */
export class ConnectSigner extends NConnectSigner {
  private _pubkey: string;

  constructor(pubkey: string, private relays?: string[]) {
    super({
      pubkey,
      // TODO: use a remote relay for `nprofile` signing (if present and `Conf.relay` isn't already in the list)
      relay: Storages.pubsub,
      signer: new AdminSigner(),
      timeout: 60000,
    });

    this._pubkey = pubkey;
  }

  // Prevent unnecessary NIP-46 round-trips.
  async getPublicKey(): Promise<string> {
    return this._pubkey;
  }

  /** Get the user's relays if they passed in an `nprofile` auth token. */
  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    return this.relays?.reduce<Record<string, { read: boolean; write: boolean }>>((acc, relay) => {
      acc[relay] = { read: true, write: true };
      return acc;
    }, {}) ?? {};
  }
}

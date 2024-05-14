import { NConnectSigner } from '@nostrify/nostrify';

import { AdminSigner } from '@/signers/AdminSigner.ts';
import { Storages } from '@/storages.ts';

/**
 * NIP-46 signer.
 *
 * Simple extension of nostrify's `NConnectSigner`, with our options to keep it DRY.
 */
export class ConnectSigner extends NConnectSigner {
  constructor(pubkey: string) {
    super({
      pubkey,
      relay: Storages.pubsub,
      signer: new AdminSigner(),
      timeout: 60000,
    });
  }
}

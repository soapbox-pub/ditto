import type { NostrSigner } from '@nostrify/types';
import { NSecSigner, NBrowserSigner, NConnectSigner } from '@nostrify/nostrify';
import type { NConnectSignerOpts } from '@nostrify/nostrify';

import { signPsbtLocal } from '@/lib/bitcoin';

// ---------------------------------------------------------------------------
// BtcSigner interface
// ---------------------------------------------------------------------------

/**
 * A Nostr signer extended with Bitcoin PSBT signing capability.
 *
 * Implementations receive a hex-encoded unsigned PSBT, sign all Taproot
 * inputs whose `tapInternalKey` matches the signer's key, and return the
 * hex-encoded signed (but not finalized) PSBT.
 */
export interface BtcSigner extends NostrSigner {
  signPsbt(psbtHex: string): Promise<string>;
}

/** Runtime check for whether a signer supports `signPsbt`. */
export function hasBtcSigning(signer: NostrSigner): signer is BtcSigner {
  return typeof (signer as BtcSigner).signPsbt === 'function';
}

// ---------------------------------------------------------------------------
// NSecSignerBtc — local nsec signing
// ---------------------------------------------------------------------------

/**
 * Extends `NSecSigner` with local Taproot PSBT signing.
 *
 * `NSecSigner` stores the secret key in a JS `#private` field that subclasses
 * cannot access. To work around this, the constructor accepts the raw secret
 * key bytes, passes them to `super()`, and keeps its own copy for Bitcoin use.
 */
export class NSecSignerBtc extends NSecSigner implements BtcSigner {
  private readonly secretKeyBytes: Uint8Array;

  constructor(secretKey: Uint8Array) {
    super(secretKey);
    this.secretKeyBytes = new Uint8Array(secretKey);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const privateKeyHex = Buffer.from(this.secretKeyBytes).toString('hex');
    return signPsbtLocal(psbtHex, privateKeyHex);
  }
}

// ---------------------------------------------------------------------------
// NBrowserSignerBtc — NIP-07 extension signing
// ---------------------------------------------------------------------------

/**
 * Extends `NBrowserSigner` with NIP-07 `window.nostr.signPsbt()` support.
 *
 * Calls the extension's `signPsbt` method if available. If the extension does
 * not expose `signPsbt`, an error is thrown with a user-friendly message.
 */
export class NBrowserSignerBtc extends NBrowserSigner implements BtcSigner {
  constructor(opts?: { timeout?: number }) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    // `awaitNostr` is TypeScript-private but JavaScript-public at runtime.
    const nostr = await (this as unknown as { awaitNostr(): Promise<Record<string, unknown>> }).awaitNostr();

    if (typeof nostr.signPsbt !== 'function') {
      throw new Error(
        "Your browser extension doesn't support sending Bitcoin. Try a different extension, or log in with your secret key.",
      );
    }

    const signPsbt = nostr.signPsbt as (hex: string) => Promise<string>;
    return signPsbt(psbtHex);
  }
}

// ---------------------------------------------------------------------------
// NConnectSignerBtc — NIP-46 remote signer
// ---------------------------------------------------------------------------

/**
 * Extends `NConnectSigner` with NIP-46 `sign_psbt` RPC support.
 *
 * Sends a `sign_psbt` command over the NIP-46 relay channel. The remote
 * signer handles the TapTweak and Schnorr signing internally. If the remote
 * signer does not support `sign_psbt`, it returns an error which is propagated
 * with a user-friendly message.
 */
export class NConnectSignerBtc extends NConnectSigner implements BtcSigner {
  constructor(opts: NConnectSignerOpts) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    try {
      // `cmd` is TypeScript-private but JavaScript-public at runtime.
      const cmd = (this as unknown as { cmd(method: string, params: string[]): Promise<string> }).cmd;
      return await cmd.call(this, 'sign_psbt', [psbtHex]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Your remote signer doesn't support sending Bitcoin. Update your signer, or log in with your secret key. (${msg})`,
      );
    }
  }
}

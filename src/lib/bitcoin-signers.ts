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
 * Heuristics for detecting whether a NIP-46 `sign_psbt` error reflects a
 * missing-capability rejection (e.g. "method not supported", "unknown
 * command") versus a transient operational failure (network, user rejection,
 * malformed input). We have to match on strings because NIP-46 errors are
 * plain strings without structured codes.
 */
const CAPABILITY_ERROR_PATTERNS = [
  /unknown\s+(method|command)/i,
  /not\s+(implemented|supported|found)/i,
  /unsupported\s+method/i,
  /method\s+not\s+found/i,
  /invalid\s+method/i,
  /no\s+such\s+method/i,
];

function looksLikeCapabilityError(msg: string): boolean {
  return CAPABILITY_ERROR_PATTERNS.some((re) => re.test(msg));
}

/**
 * Extends `NConnectSigner` with NIP-46 `sign_psbt` RPC support.
 *
 * Sends a `sign_psbt` command over the NIP-46 relay channel. The remote
 * signer handles the TapTweak and Schnorr signing internally.
 *
 * NIP-46 returns unstructured string errors, so we use pattern matching to
 * distinguish capability failures (the signer doesn't know the method) from
 * operational failures (network, user rejection, bad input). Only capability
 * failures are re-wrapped with the "doesn't support sending Bitcoin" message
 * that flips the UI into the unsupported state; everything else propagates
 * unchanged so the caller can surface the real error.
 */
export class NConnectSignerBtc extends NConnectSigner implements BtcSigner {
  constructor(opts: NConnectSignerOpts) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    // `cmd` is TypeScript-private but JavaScript-public at runtime.
    const cmd = (this as unknown as { cmd(method: string, params: string[]): Promise<string> }).cmd;
    try {
      return await cmd.call(this, 'sign_psbt', [psbtHex]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (looksLikeCapabilityError(msg)) {
        throw new Error(
          `Your remote signer doesn't support sending Bitcoin. Update your signer, or log in with your secret key. (${msg})`,
        );
      }
      // Not a capability failure — propagate the original error so the user
      // sees the actual reason (timeout, rejection, malformed PSBT, etc.).
      throw error;
    }
  }
}

import type { NostrSigner } from '@nostrify/types';
import { NSecSigner, NBrowserSigner } from '@nostrify/nostrify';

// ---------------------------------------------------------------------------
// BtcSigner interface
// ---------------------------------------------------------------------------

/**
 * A Nostr signer extended with Bitcoin PSBT signing capability.
 *
 * Implementations receive a hex-encoded unsigned PSBT, sign all Taproot
 * inputs whose `tapInternalKey` matches the signer's key, and return the
 * hex-encoded signed (but not finalized) PSBT.
 *
 * **Lazy crypto.** The heavy Bitcoin/PSBT/silent-payments implementation
 * lives in `bitcoin-signers-impl.ts` and is only `import()`-ed the first
 * time `signPsbt` is called. This module — and therefore `useCurrentUser`,
 * which constructs these signers on every page — never statically pulls in
 * `@scure/btc-signer` or the `@/lib/bitcoin*` stack, keeping ~150 kB of
 * crypto out of the app's entry chunk.
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
 * key bytes, passes them to `super()`, and keeps its own copy in a true
 * runtime-private `#secretKeyBytes` field so the key is not reachable via
 * property enumeration or reflection on the instance.
 *
 * The actual PSBT signing (including the BIP-375 / silent-payments path) is
 * implemented in `bitcoin-signers-impl.ts` and dynamically imported on first
 * use, so the heavy crypto stack stays out of the entry bundle.
 */
export class NSecSignerBtc extends NSecSigner implements BtcSigner {
  readonly #secretKeyBytes: Uint8Array;

  constructor(secretKey: Uint8Array) {
    super(secretKey);
    this.#secretKeyBytes = new Uint8Array(secretKey);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const { signNsecPsbt } = await import('@/lib/bitcoin-signers-impl');
    return signNsecPsbt(psbtHex, this.#secretKeyBytes);
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
        "Your browser extension doesn't support sending Bitcoin. Try a different extension that supports Bitcoin (PSBT) signing.",
      );
    }

    const signPsbt = nostr.signPsbt as (hex: string) => Promise<string>;
    return signPsbt(psbtHex);
  }
}

// The NIP-46 bunker signer is `Nip46Signer` in `@/lib/nip46Signer.ts`.

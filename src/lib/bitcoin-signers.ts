import type { NostrEvent, NostrSigner } from '@nostrify/types';
import { NSecSigner } from '@nostrify/nostrify';
import { verifyEvent } from 'nostr-tools';

import { awaitNip07Provider, getNip07Provider, hasGetSigner, type Nip07Provider } from '@/lib/nip07';

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
 * A NIP-07 browser-extension signer with `window.nostr.signPsbt()` support,
 * normalizing behavior across extensions as `NBrowserSigner` does.
 *
 * Given the login's `pubkey`, it acts as that account through the
 * extension's `getSigner(pubkey)` when the extension offers it (Din does), so
 * switching accounts in the extension doesn't change who Ditto signs as. A
 * `NotFoundError` from `getSigner` (the extension no longer gives this site
 * that account) is passed on, never answered by acting as another account.
 * Extensions without `getSigner` are called directly, as before.
 */
export class NBrowserSignerBtc implements BtcSigner {
  readonly #pubkey: string | undefined;
  readonly #timeout: number;
  #pinned: Promise<NostrSigner> | undefined;

  constructor(opts?: { pubkey?: string; timeout?: number }) {
    this.#pubkey = opts?.pubkey;
    this.#timeout = opts?.timeout ?? 3000;
  }

  /** The signer to call: pinned to the login's account when the extension can, else `window.nostr`. */
  async #signer(): Promise<Nip07Provider> {
    const nostr = await awaitNip07Provider(this.#timeout);
    if (!this.#pubkey || !hasGetSigner(nostr)) return nostr;
    if (!this.#pinned) {
      const pinned = nostr.getSigner(this.#pubkey);
      this.#pinned = pinned;
      // Ask again next time: the account may be given back to the site.
      pinned.catch(() => {
        if (this.#pinned === pinned) this.#pinned = undefined;
      });
    }
    return this.#pinned;
  }

  async getPublicKey(): Promise<string> {
    const pubkey = await (await this.#signer()).getPublicKey();
    if (typeof pubkey !== 'string') {
      throw new Error(`Nostr public key retrieval failed: expected string, got ${JSON.stringify(pubkey)}`);
    }
    return pubkey;
  }

  async signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent> {
    const signed = await (await this.#signer()).signEvent(event);
    if (typeof signed !== 'object' || !signed || !signed.id || !signed.pubkey || !signed.sig) {
      throw new Error(
        `Nostr event signing failed: expected object with id, pubkey, and sig, got ${JSON.stringify(signed)}`,
      );
    }
    // Rebuilt from the NIP-01 fields alone, which also drops nostr-tools'
    // cached `verifiedSymbol`, so the signature is really checked.
    const normalized: NostrEvent = {
      id: signed.id,
      pubkey: signed.pubkey,
      kind: signed.kind,
      content: signed.content,
      tags: signed.tags,
      created_at: signed.created_at,
      sig: signed.sig,
    };
    if (!verifyEvent(normalized)) {
      throw new Error('Nostr event signing failed: the extension returned an invalid event');
    }
    return normalized;
  }

  async getRelays(): Promise<Record<string, { read: boolean; write: boolean }>> {
    const signer = await this.#signer();
    if (!signer.getRelays) return {};
    const relays = await signer.getRelays();
    if (typeof relays !== 'object' || relays === null) {
      throw new Error(`Nostr getRelays failed: expected object, got ${JSON.stringify(relays)}`);
    }
    return relays;
  }

  get nip04(): NostrSigner['nip04'] {
    return this.#cipher('nip04', 'NIP-04');
  }

  get nip44(): NostrSigner['nip44'] {
    return this.#cipher('nip44', 'NIP-44');
  }

  /**
   * Undefined when a loaded extension lacks the scheme; otherwise (including
   * before the extension has loaded) a wrapper that waits for it.
   */
  #cipher(scheme: 'nip04' | 'nip44', label: string): NostrSigner['nip44'] {
    const loaded = getNip07Provider();
    if (loaded && !loaded[scheme]) return undefined;

    const run = async (op: 'encrypt' | 'decrypt', pubkey: string, text: string): Promise<string> => {
      const cipher = (await this.#signer())[scheme];
      if (!cipher) {
        throw new Error(`${label} ${op === 'encrypt' ? 'encryption' : 'decryption'} not supported by extension`);
      }
      const result = await cipher[op](pubkey, text);
      if (typeof result !== 'string') {
        throw new Error(`${label} ${op === 'encrypt' ? 'encryption' : 'decryption'} failed: expected string result, got ${JSON.stringify(result)}`);
      }
      return result;
    };

    return {
      encrypt: (pubkey, plaintext) => run('encrypt', pubkey, plaintext),
      decrypt: (pubkey, ciphertext) => run('decrypt', pubkey, ciphertext),
    };
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const signer = await this.#signer();
    if (typeof signer.signPsbt !== 'function') {
      throw new Error(
        "Your browser extension doesn't support sending Bitcoin. Try a different extension that supports Bitcoin (PSBT) signing.",
      );
    }
    return signer.signPsbt(psbtHex);
  }
}

// The NIP-46 bunker signer is `Nip46Signer` in `@/lib/nip46Signer.ts`.

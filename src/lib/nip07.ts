import type { NostrSigner } from '@nostrify/types';

/**
 * The NIP-07 provider at `window.nostr`, with the optional multi-account
 * additions some providers (Din) offer:
 *
 * - `requestPublicKey()` asks the user to give the site an account and
 *   resolves with its key. It always asks, so the provider shows the account.
 * - `getSigner(pubkey)` resolves, without asking, with a NIP-07 signer pinned
 *   to an account the site holds, whatever account the provider itself is
 *   acting as. It rejects with a `NotFoundError` DOMException if the site
 *   doesn't hold it.
 */
export interface Nip07Provider extends NostrSigner {
  requestPublicKey?(): Promise<string>;
  getSigner?(pubkey: string): Promise<NostrSigner>;
  signPsbt?(psbtHex: string): Promise<string>;
}

/** The provider at `window.nostr`, if one has been injected. */
export function getNip07Provider(): Nip07Provider | undefined {
  const provider = (globalThis as { nostr?: unknown }).nostr;
  if (provider && typeof (provider as Nip07Provider).getPublicKey === 'function') {
    return provider as Nip07Provider;
  }
  return undefined;
}

/** Whether the provider can hand out signers pinned to an account. */
export function hasGetSigner(
  provider: Nip07Provider | undefined,
): provider is Nip07Provider & Required<Pick<Nip07Provider, 'getSigner'>> {
  return typeof provider?.getSigner === 'function';
}

/** Whether the provider can ask the user for an account to give the site. */
export function hasRequestPublicKey(
  provider: Nip07Provider | undefined,
): provider is Nip07Provider & Required<Pick<Nip07Provider, 'requestPublicKey'>> {
  return typeof provider?.requestPublicKey === 'function';
}

/** Wait for `window.nostr`, polling every 100 ms up to `timeout`. */
export function awaitNip07Provider(timeout = 3000): Promise<Nip07Provider> {
  const provider = getNip07Provider();
  if (provider) return Promise.resolve(provider);

  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const provider = getNip07Provider();
      if (provider) {
        clearInterval(interval);
        resolve(provider);
      } else if (Date.now() >= deadline) {
        clearInterval(interval);
        reject(new Error('Browser extension not available'));
      }
    }, 100);
  });
}

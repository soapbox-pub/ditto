import type { NostrSigner } from '@nostrify/types';

/**
 * The NIP-07 provider at `window.nostr`, with the optional multi-account
 * additions some providers (Din, Tenna) offer:
 *
 * - `connect()` asks the user to give the site an account and resolves with
 *   a signer for it. It always asks, so the provider shows the account.
 * - `getSigner(pubkey)` resolves, without asking, with a NIP-07 signer pinned
 *   to an account the site holds, whatever account the provider itself is
 *   acting as. It rejects with a `NotFoundError` DOMException if the site
 *   doesn't hold it.
 * - `disconnect(pubkey)` lets the site's account go, without asking.
 *
 * A signer from either keeps its account, and its `getPublicKey()` answers
 * without asking, even once the site no longer holds the account.
 */
export interface Nip07Provider extends NostrSigner {
  connect?(): Promise<NostrSigner>;
  getSigner?(pubkey: string): Promise<NostrSigner>;
  disconnect?(pubkey: string): Promise<void>;
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
export function hasConnect(
  provider: Nip07Provider | undefined,
): provider is Nip07Provider & Required<Pick<Nip07Provider, 'connect'>> {
  return typeof provider?.connect === 'function';
}

/** Whether the provider lets the site give an account back. */
export function hasDisconnect(
  provider: Nip07Provider | undefined,
): provider is Nip07Provider & Required<Pick<Nip07Provider, 'disconnect'>> {
  return typeof provider?.disconnect === 'function';
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

import { HDKey } from '@scure/bip32';

import { Conf } from '@/config.ts';

/**
 * HD wallet based on the `DITTO_NSEC`.
 * The wallet is used to derive keys for various purposes.
 * It is a singleton with static methods, and the keys are cached.
 */
export class DittoWallet {
  static #root = HDKey.fromMasterSeed(Conf.seckey);
  static #keys = new Map<string, HDKey>();

  /** Derive the key cached. */
  static derive(path: string): HDKey {
    const existing = this.#keys.get(path);
    if (existing) {
      return existing;
    } else {
      const key = this.#root.derive(path);
      this.#keys.set(path, key);
      return key;
    }
  }

  /** Derive the key and return the bytes. */
  static deriveKey(path: string): Uint8Array {
    const { privateKey } = this.derive(path);

    if (!privateKey) {
      throw new Error('Private key not available');
    }

    return privateKey;
  }

  /** Database encryption key for AES-GCM encryption of database columns. */
  static get dbKey(): Uint8Array {
    return this.deriveKey(Conf.wallet.dbKeyPath);
  }

  /** VAPID secret key, used for web push notifications. ES256. */
  static get vapidKey(): Uint8Array {
    return this.deriveKey(Conf.wallet.vapidKeyPath);
  }
}

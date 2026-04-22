import { Capacitor } from '@capacitor/core';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

/**
 * Storage adapter that uses native secure storage (iOS Keychain / Android KeyStore)
 * on Capacitor builds and falls back to localStorage on web.
 *
 * Implements the `NLoginStorage` interface from @nostrify/react.
 *
 * On the first native read, if the key is not found in secure storage but exists
 * in localStorage, it is automatically migrated to secure storage and the
 * plaintext localStorage copy is removed.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      return localStorage.getItem(key);
    }

    try {
      const { value } = await SecureStoragePlugin.get({ key });
      return value;
    } catch {
      // Key not found in secure storage — check localStorage for migration.
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        // Migrate to secure storage and remove the plaintext copy.
        await SecureStoragePlugin.set({ key, value: legacy });
        localStorage.removeItem(key);
        return legacy;
      }
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.setItem(key, value);
      return;
    }

    await SecureStoragePlugin.set({ key, value });
  },

  async removeItem(key: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      localStorage.removeItem(key);
      return;
    }

    try {
      await SecureStoragePlugin.remove({ key });
    } catch {
      // Key didn't exist — ignore.
    }
  },
};

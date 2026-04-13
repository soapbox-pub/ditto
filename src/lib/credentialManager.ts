/**
 * Utility for storing and retrieving Nostr secret keys using the platform's
 * native credential / password manager.
 *
 * - **Capacitor iOS**: Uses `@capgo/capacitor-autofill-save-password` which
 *   calls `SecAddSharedWebCredential` / `SecRequestSharedWebCredential` under
 *   the hood, triggering the iCloud Keychain "Save Password" / credential
 *   picker UI. Requires the `webcredentials:` Associated Domains entitlement
 *   and a matching `apple-app-site-association` file on the domain.
 *
 * - **Chromium browsers** (Chrome, Edge, Opera, Android WebView): Uses the
 *   `PasswordCredential` API to trigger the native "Save password?" prompt.
 *
 * - **Other browsers** (Safari web, Firefox): Silently falls back — all
 *   functions return `false` / `undefined` without error.
 */

import { Capacitor } from '@capacitor/core';
import { SavePassword } from '@capgo/capacitor-autofill-save-password';

import { downloadTextFile } from '@/lib/downloadFile';

/** The domain used for Shared Web Credentials on iOS. */
const CREDENTIAL_DOMAIN = 'ditto.pub';

/** Whether the browser supports PasswordCredential (Chromium-only). */
export function supportsPasswordCredential(): boolean {
  return typeof window !== 'undefined' && 'PasswordCredential' in window;
}


/**
 * Store a Nostr secret key in the platform's credential manager.
 *
 * On Capacitor iOS this triggers the iCloud Keychain "Save Password?" sheet.
 * On Chromium browsers this triggers the native "Save password?" prompt.
 * On unsupported platforms this is a silent no-op.
 *
 * @param npub  - The user's npub (used as the credential username / account)
 * @param nsec  - The user's nsec (used as the credential password)
 * @param name  - Optional display name (Chromium only — shown in the picker)
 * @returns `true` if the credential was stored, `false` if unsupported or rejected
 */
export async function storeNsecCredential(
  npub: string,
  nsec: string,
  name?: string,
): Promise<boolean> {
  // Capacitor native path (iOS / Android).
  if (Capacitor.isNativePlatform()) {
    try {
      await SavePassword.promptDialog({
        username: npub,
        password: nsec,
        url: CREDENTIAL_DOMAIN,
      });
      return true;
    } catch {
      return false;
    }
  }

  // Chromium PasswordCredential path (web).
  if (!supportsPasswordCredential()) return false;

  try {
    const credential = new PasswordCredential({
      id: npub,
      password: nsec,
      name: name ?? npub,
    });

    await navigator.credentials.store(credential);
    return true;
  } catch {
    // User dismissed, or browser blocked the call (e.g. non-HTTPS, iframe).
    return false;
  }
}

/**
 * Retrieve a previously-stored Nostr credential from the platform's
 * password manager.
 *
 * On Capacitor iOS this shows the iCloud Keychain credential picker.
 * On Chromium browsers this shows the native credential picker.
 *
 * @returns The stored credential, or `undefined` if unavailable / dismissed.
 */
export async function getNsecCredential(): Promise<
  { npub: string; nsec: string } | undefined
> {
  // Capacitor native path (iOS / Android).
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await SavePassword.readPassword();
      if (result.username && result.password) {
        return { npub: result.username, nsec: result.password };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  // Chromium PasswordCredential path (web).
  if (!supportsPasswordCredential()) return undefined;

  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    } as CredentialRequestOptions);

    if (credential && 'password' in credential) {
      const pc = credential as PasswordCredential;
      if (pc.id && pc.password) {
        return { npub: pc.id, nsec: pc.password };
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save a Nostr secret key using the best method available on the platform.
 *
 * - **Native (iOS / Android)**: Prompts the credential manager
 *   (iCloud Keychain / Google). Throws if the user dismisses so the caller
 *   can block progression and retry.
 *
 * - **Web**: Downloads the key as a `.nsec.txt` file (always), and also
 *   attempts to store it via `PasswordCredential` as a bonus (Chromium).
 *   The bonus store is fire-and-forget — it never blocks or throws.
 *
 * @param npub - The user's npub (credential username / account)
 * @param nsec - The user's nsec (credential password)
 * @param name - Optional display name (Chromium only)
 * @throws On native platforms if the user dismisses the credential prompt.
 */
export async function saveNsec(
  npub: string,
  nsec: string,
  name?: string,
): Promise<void> {
  // Native: credential manager is the sole save mechanism.
  if (Capacitor.isNativePlatform()) {
    const saved = await storeNsecCredential(npub, nsec, name);
    if (!saved) {
      throw new Error('Credential save was dismissed');
    }
    return;
  }

  // Web: always download the file as the primary save mechanism.
  const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;
  await downloadTextFile(filename, nsec);

  // Bonus: also try to store in the browser's password manager (Chromium).
  storeNsecCredential(npub, nsec, name).catch(() => {});
}

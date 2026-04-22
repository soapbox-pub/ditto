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

/** Result of a `saveNsec` call. */
export type SaveNsecResult = 'saved' | 'saved-to-file' | 'dismissed';

/** Build the filename used for the fallback `.nsec.txt` file. */
function nsecFilename(npub: string, appName?: string): string {
  // Slugify the app name so it's filesystem-safe. On Capacitor `location.hostname`
  // is always `localhost`, which produces meaningless filenames — prefer the
  // app name when the caller provides it.
  const slug = (appName ?? location.hostname)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'nostr';
  return `${slug}-${npub.slice(5, 9)}.nsec.txt`;
}

/**
 * Save a Nostr secret key using the best method available on the platform.
 *
 * - **Android Capacitor**: Tries the AndroidX Credential Manager first
 *   (which delegates to Google Password Manager or any registered provider).
 *   On de-Googled devices (GrapheneOS, /e/OS, etc.) there may be no provider
 *   available and the call fails — in that case we fall back to writing the
 *   key to the app's Documents directory so the user always has a backup.
 *   Returns `'saved'` on keychain success, `'saved-to-file'` on fallback.
 *
 * - **iOS Capacitor**: Prompts iCloud Keychain via
 *   `SecAddSharedWebCredential`. Returns `'dismissed'` if the user dismisses
 *   the sheet — dismissal is a legitimate user choice and not an error, so
 *   callers can proceed anyway. No file fallback on iOS: the Documents
 *   folder is accessible without authentication, so silently writing a
 *   plaintext nsec there would violate user intent.
 *
 * - **Web**: Downloads the key as a `.nsec.txt` file (always), and also
 *   attempts to store it via `PasswordCredential` as a bonus (Chromium).
 *   The bonus store is fire-and-forget — it never blocks or throws.
 *   Resolves to `'saved'` once the file download completes.
 *
 * Real errors (e.g. filesystem write failure on native) still throw.
 *
 * @param npub - The user's npub (credential username / account)
 * @param nsec - The user's nsec (credential password)
 * @param name - Optional app/display name. Used as the Chromium password-
 *               manager entry name, and as the filename slug for any
 *               fallback `.nsec.txt` file written to disk. On Capacitor
 *               `location.hostname` is always `localhost`, so passing the
 *               app name is the only way to get a meaningful filename.
 * @returns `'saved'` if stored in the platform credential manager or
 *          downloaded as a file on web; `'saved-to-file'` if stored as a
 *          file via the Android fallback; `'dismissed'` if the user
 *          dismissed the iOS credential prompt.
 */
export async function saveNsec(
  npub: string,
  nsec: string,
  name?: string,
): Promise<SaveNsecResult> {
  if (Capacitor.isNativePlatform()) {
    const saved = await storeNsecCredential(npub, nsec, name);
    if (saved) return 'saved';

    // Android fallback: write the key to Documents so de-Googled devices
    // (no credential provider installed) still get a persistent backup.
    if (Capacitor.getPlatform() === 'android') {
      await downloadTextFile(nsecFilename(npub, name), nsec);
      return 'saved-to-file';
    }

    // iOS: dismissal is a deliberate user choice, no automatic fallback.
    return 'dismissed';
  }

  // Web: always download the file as the primary save mechanism.
  await downloadTextFile(nsecFilename(npub, name), nsec);

  // Bonus: also try to store in the browser's password manager (Chromium).
  storeNsecCredential(npub, nsec, name).catch(() => {});

  return 'saved';
}

/**
 * Utility for storing and retrieving Nostr secret keys using the
 * Credential Management API (PasswordCredential).
 *
 * This is a **progressive enhancement** — PasswordCredential is only
 * available in Chromium-based browsers (Chrome, Edge, Opera, Android WebView).
 * Safari and Firefox do not support it. All call sites must handle the
 * `undefined` / rejection cases gracefully and fall back to manual key entry.
 */

/** Whether the browser supports PasswordCredential. */
export function supportsPasswordCredential(): boolean {
  return typeof window !== 'undefined' && 'PasswordCredential' in window;
}

/**
 * Store a Nostr secret key in the browser's credential manager.
 *
 * On supported browsers this triggers the native "Save password?" prompt,
 * which syncs the credential via the user's password manager (Google Password
 * Manager, Samsung Pass, etc.).
 *
 * @param npub  - The user's npub (used as the credential `id` / username)
 * @param nsec  - The user's nsec (used as the credential `password`)
 * @param name  - Optional display name shown in the credential chooser
 * @returns `true` if the credential was stored, `false` if unsupported or rejected
 */
export async function storeNsecCredential(
  npub: string,
  nsec: string,
  name?: string,
): Promise<boolean> {
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
 * Retrieve a previously-stored Nostr credential from the browser's password
 * manager.
 *
 * On supported browsers this shows the native credential picker. The returned
 * object contains the `id` (npub) and `password` (nsec).
 *
 * @returns The stored credential, or `undefined` if unavailable / dismissed.
 */
export async function getNsecCredential(): Promise<
  { npub: string; nsec: string } | undefined
> {
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

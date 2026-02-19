/**
 * NIP-05 utility functions for formatting and parsing NIP-05 identifiers.
 */

/**
 * Formats a NIP-05 identifier for display.
 * - `_@domain.com` becomes `domain.com` (the `_@` prefix is the default/root user and shouldn't render)
 * - `user@domain.com` stays as `user@domain.com`
 */
export function formatNip05Display(nip05: string): string {
  if (nip05.startsWith('_@')) {
    return nip05.slice(2);
  }
  return nip05;
}

/**
 * Extracts the domain from a NIP-05 identifier.
 * `user@domain.com` → `domain.com`
 */
export function getNip05Domain(nip05: string | undefined): string | undefined {
  if (!nip05) return undefined;
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return undefined;
  return nip05.slice(atIndex + 1);
}

/**
 * Extracts the username portion from a NIP-05 identifier.
 * `user@domain.com` → `user`
 * `_@domain.com` → `_`
 */
export function getNip05User(nip05: string): string {
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return nip05;
  return nip05.slice(0, atIndex);
}

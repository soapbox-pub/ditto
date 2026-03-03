import { nip19 } from 'nostr-tools';

/**
 * Known NIP-19 bech32 prefixes that the app can route to.
 */
const NIP19_PREFIXES = ['npub1', 'nprofile1', 'note1', 'nevent1', 'naddr1'];

/**
 * Matches a 64-character lowercase hex string (a raw Nostr event ID or pubkey).
 */
const HEX_64_RE = /^[0-9a-f]{64}$/;

/**
 * Checks whether a string looks like a NIP-05 identifier (user@domain.com)
 * or a bare domain (e.g. fiatjaf.com). Strips a leading `@` if present.
 */
function looksLikeNip05(value: string): boolean {
  const cleaned = value.startsWith('@') ? value.slice(1) : value;
  // user@domain.com — must have text on both sides of @
  if (cleaned.includes('@')) {
    const atIndex = cleaned.indexOf('@');
    return atIndex > 0 && atIndex < cleaned.length - 1 && cleaned.slice(atIndex + 1).includes('.');
  }
  // bare domain — must look like "something.tld" with non-empty parts on both sides of the dot
  const dotIndex = cleaned.indexOf('.');
  if (
    dotIndex > 0 &&
    dotIndex < cleaned.length - 1 &&
    !NIP19_PREFIXES.some((p) => cleaned.startsWith(p))
  ) {
    return true;
  }
  return false;
}

/**
 * If `input` is a Nostr identifier (NIP-19 bech32 or NIP-05 address),
 * returns the path the app should navigate to (e.g. `/npub1...` or `/user@domain.com`).
 *
 * Returns `null` if the input is a regular search query.
 */
export function getNostrIdentifierPath(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strip nostr: URI prefix if present
  const value = trimmed.startsWith('nostr:') ? trimmed.slice(6) : trimmed;

  // Try NIP-19 decode
  if (NIP19_PREFIXES.some((p) => value.startsWith(p))) {
    try {
      nip19.decode(value); // throws if invalid
      return `/${value}`;
    } catch {
      // Not a valid NIP-19 — fall through
    }
  }

  // Try raw 64-char hex (event ID or pubkey) — route handles it directly
  if (HEX_64_RE.test(value)) {
    return `/${value}`;
  }

  // Try NIP-05
  if (looksLikeNip05(value)) {
    // Strip leading @ for the URL path
    const cleaned = value.startsWith('@') ? value.slice(1) : value;
    return `/${cleaned}`;
  }

  return null;
}

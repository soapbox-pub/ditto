import { nip19 } from 'nostr-tools';
import type { DecodedResult } from 'nostr-tools/nip19';

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
export function looksLikeNip05(value: string): boolean {
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
 * Checks whether a string looks like a full URL (http:// or https://).
 */
export function isFullUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to decode the input as a NIP-19 bech32 identifier.
 * Strips the `nostr:` URI prefix if present.
 * Returns the decoded result or `null` if it isn't a valid NIP-19 string.
 */
export function tryDecodeNip19(input: string): { decoded: DecodedResult; raw: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const value = trimmed.startsWith('nostr:') ? trimmed.slice(6) : trimmed;

  if (NIP19_PREFIXES.some((p) => value.startsWith(p))) {
    try {
      const decoded = nip19.decode(value);
      return { decoded, raw: value };
    } catch {
      // Not a valid NIP-19
    }
  }
  return null;
}

/**
 * Check if the input is a raw 64-char hex string (event ID or pubkey).
 */
export function isHex64(input: string): boolean {
  return HEX_64_RE.test(input.trim());
}

/** Coordinates for an addressable event (naddr). */
interface AddrCoords {
  kind: number;
  pubkey: string;
  identifier: string;
}

/**
 * Structured result describing a detected Nostr identifier in user input.
 */
export type IdentifierMatch =
  | { type: 'nip05'; identifier: string }
  | { type: 'npub'; pubkey: string; raw: string }
  | { type: 'nprofile'; pubkey: string; raw: string }
  | { type: 'note'; eventId: string; raw: string }
  | { type: 'nevent'; eventId: string; relays?: string[]; authorHint?: string; raw: string }
  | { type: 'naddr'; addr: AddrCoords; relays?: string[]; raw: string }
  | { type: 'hex'; hex: string };

/**
 * Detect whether a search query is a Nostr identifier.
 * Returns a structured result, or null if it's a regular search query.
 * Does NOT match full URLs (those are handled separately).
 */
export function detectIdentifier(query: string): IdentifierMatch | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // Don't detect identifiers if it's a URL
  if (isFullUrl(trimmed)) return null;

  const value = trimmed.startsWith('nostr:') ? trimmed.slice(6) : trimmed;

  // Try NIP-19
  const nip19Result = tryDecodeNip19(value);
  if (nip19Result) {
    const { decoded, raw } = nip19Result;
    switch (decoded.type) {
      case 'npub':
        return { type: 'npub', pubkey: decoded.data, raw };
      case 'nprofile':
        return { type: 'nprofile', pubkey: decoded.data.pubkey, raw };
      case 'note':
        return { type: 'note', eventId: decoded.data, raw };
      case 'nevent':
        return {
          type: 'nevent',
          eventId: decoded.data.id,
          relays: decoded.data.relays,
          authorHint: decoded.data.author,
          raw,
        };
      case 'naddr':
        return {
          type: 'naddr',
          addr: { kind: decoded.data.kind, pubkey: decoded.data.pubkey, identifier: decoded.data.identifier },
          relays: decoded.data.relays,
          raw,
        };
    }
  }

  // Try hex
  if (isHex64(value)) {
    return { type: 'hex', hex: value };
  }

  // Try NIP-05
  if (looksLikeNip05(value)) {
    const cleaned = value.startsWith('@') ? value.slice(1) : value;
    return { type: 'nip05', identifier: cleaned };
  }

  return null;
}

/**
 * If `input` is a Nostr identifier (NIP-19 bech32, hex, or NIP-05 address),
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

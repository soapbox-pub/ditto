import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** The fixed length of a base36-encoded 32-byte pubkey. */
const BASE36_PUBKEY_LENGTH = 50;

/** Encode a 32-byte hex pubkey as a base36 string (50 chars, zero-padded). */
export function hexToBase36(hex: string): string {
  let n = 0n;
  for (let i = 0; i < hex.length; i++) {
    n = n * 16n + BigInt(parseInt(hex[i], 16));
  }
  const b36 = n.toString(36);
  return b36.padStart(BASE36_PUBKEY_LENGTH, '0');
}

/** Decode a base36-encoded pubkey back to a 64-char hex string. */
function base36ToHex(b36: string): string {
  const n = [...b36].reduce((acc, ch) => acc * 36n + BigInt(parseInt(ch, 36)), 0n);
  return n.toString(16).padStart(64, '0');
}

/**
 * Parsed nsite subdomain — either a root site (kind 15128) or a named site (kind 35128).
 */
export interface ParsedNsiteSubdomain {
  /** The hex pubkey of the site owner. */
  pubkey: string;
  /** The event kind (15128 for root, 35128 for named). */
  kind: 15128 | 35128;
  /** The d-tag identifier (empty string for root sites). */
  identifier: string;
}

/**
 * Parse an nsite subdomain back into its components.
 *
 * - Root site subdomain: `<npub1...>` → kind 15128, identifier ""
 * - Named site subdomain: `<50-char-base36><dTag>` → kind 35128, identifier = dTag
 *
 * Returns null if the subdomain cannot be parsed.
 */
export function parseNsiteSubdomain(subdomain: string): ParsedNsiteSubdomain | null {
  // Root site: subdomain is an npub
  if (subdomain.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(subdomain);
      if (decoded.type !== 'npub') return null;
      return { pubkey: decoded.data as string, kind: 15128, identifier: '' };
    } catch {
      return null;
    }
  }

  // Named site: first 50 chars are base36 pubkey, rest is d-tag
  if (subdomain.length <= BASE36_PUBKEY_LENGTH) return null;
  const b36Part = subdomain.slice(0, BASE36_PUBKEY_LENGTH);
  const dTag = subdomain.slice(BASE36_PUBKEY_LENGTH);

  // Validate base36 characters
  if (!/^[0-9a-z]+$/.test(b36Part)) return null;

  try {
    const pubkey = base36ToHex(b36Part);
    return { pubkey, kind: 35128, identifier: dTag };
  } catch {
    return null;
  }
}

/**
 * Derive the NIP-5A canonical subdomain for an nsite event.
 *
 * - Root site (kind 15128): `<npub>`
 * - Named site (kind 35128 with d-tag): `<pubkeyB36><dTag>`
 */
export function getNsiteSubdomain(event: NostrEvent): string {
  const dTag = event.tags.find(([n]) => n === 'd')?.[1];

  if (event.kind === 35128 && dTag) {
    const pubkeyB36 = hexToBase36(event.pubkey);
    return `${pubkeyB36}${dTag}`;
  }

  return nip19.npubEncode(event.pubkey);
}

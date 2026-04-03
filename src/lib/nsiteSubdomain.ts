import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

/** Encode a 32-byte hex pubkey as a base36 string (50 chars, zero-padded). */
export function hexToBase36(hex: string): string {
  let n = 0n;
  for (let i = 0; i < hex.length; i++) {
    n = n * 16n + BigInt(parseInt(hex[i], 16));
  }
  const b36 = n.toString(36);
  return b36.padStart(50, '0');
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
